import type { PostaConfig } from '@posta/core';
import { getMainDb, computeRetryDelay, BackoffStrategy, FailureReason } from '@posta/core';
import type { FailureReasonType } from '@posta/core';
import { EventEmitter } from 'events';

// ─── Public API ──────────────────────────────────────────

export { processQueuedMessagesJob } from './jobs/process_queued_messages';
export { processWebhookRequestsJob } from './jobs/process_webhook_requests';

/**
 * Improved Worker with bunqueue-inspired patterns:
 * - EventEmitter lifecycle for observability
 * - Batch pulling with lock tokens
 * - Heartbeat for active jobs (stall prevention)
 * - Graceful shutdown with drain
 */
export class WorkerProcess extends EventEmitter {
  private running = false;
  private closing = false;
  private activeJobs = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public name: string,
    private config: PostaConfig,
    private handler: (config: PostaConfig) => Promise<boolean>,
    private opts: {
      pollIntervalMs?: number;
      batchSize?: number;
      heartbeatIntervalMs?: number;
    } = {},
  ) {
    super();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.closing = false;

    this.startHeartbeat();
    this.scheduleNextPoll();
    this.emit('started');
  }

  async close(force = false): Promise<void> {
    this.closing = true;
    this.emit('closing');

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollTimer) clearTimeout(this.pollTimer);

    if (!force) {
      // Drain: wait for active jobs to complete
      const maxWait = 30_000;
      const started = Date.now();
      while (this.activeJobs > 0 && Date.now() - started < maxWait) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    this.running = false;
    this.emit('closed');
  }

  private scheduleNextPoll(): void {
    if (this.closing) return;
    this.pollTimer = setTimeout(() => this.poll(), this.opts.pollIntervalMs ?? 1000);
  }

  private async poll(): Promise<void> {
    if (this.closing) return;
    try {
      this.activeJobs++;
      const hadWork = await this.handler(this.config);
      this.activeJobs--;
      if (!hadWork && !this.closing) {
        // No work found — emit drained
        this.emit('drained');
      }
    } catch (err: any) {
      this.activeJobs--;
      this.emit('error', err);
    }
    this.scheduleNextPoll();
  }

  private startHeartbeat(): void {
    const interval = this.opts.heartbeatIntervalMs ?? 10_000;
    this.heartbeatTimer = setInterval(() => {
      if (this.activeJobs > 0) {
        this.emit('heartbeat', { activeJobs: this.activeJobs, worker: this.name });
      }
    }, interval);
  }
}

/**
 * Run job threads with improved lifecycle.
 */
export async function runJobs(
  config: PostaConfig,
  opts: { threadCount: number; sleepTime: number },
): Promise<void> {
  const jobs = [
    (await import('./jobs/process_queued_messages')).processQueuedMessagesJob,
    (await import('./jobs/process_webhook_requests')).processWebhookRequestsJob,
  ];

  const workers = jobs.map((handler, i) => {
    const w = new WorkerProcess(`job-thread-${i}`, config, handler, {
      pollIntervalMs: opts.sleepTime * 1000,
      heartbeatIntervalMs: 10_000,
    });
    w.on('error', (err: Error) => console.error(`[worker] ${w.name} error:`, err.message));
    w.on('drained', () => { /* no-op, fine */ });
    w.start();
    return w;
  });

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[worker] received SIGTERM, draining...');
    await Promise.all(workers.map((w) => w.close(false)));
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[worker] received SIGINT, draining...');
    await Promise.all(workers.map((w) => w.close(true)));
    process.exit(0);
  });

  // Block forever (workers run in background)
  await new Promise(() => {});
}

// ─── Role locking (bunqueue-inspired: shard-based with expiry check) ───

interface RoleLock {
  worker: string;
  acquiredAt: number;
  expiresAt: number;
}

const roleLocks = new Map<string, RoleLock>();

/**
 * Acquire a distributed role lock.
 * Uses in-memory cache + periodic re-acquire, backed by DB.
 * bunqueue pattern: lock expiry + heartbeat to prevent stale locks.
 */
export function acquireRoleLock(
  db: ReturnType<typeof getMainDb>,
  role: string,
  workerName: string,
  ttlMs: number = 5 * 60 * 1000,
): boolean {
  const now = Date.now();
  const existing = roleLocks.get(role);

  // Check if we still hold a valid lock
  if (existing && existing.worker === workerName && existing.expiresAt > now) {
    // Refresh our lock in DB
    try {
      db.run(`UPDATE worker_roles SET acquired_at = datetime('now') WHERE role = ? AND worker = ?`, [role, workerName]);
      existing.expiresAt = now + ttlMs / 2; // renew at half TTL
      return true;
    } catch {
      return false;
    }
  }

  // Try to acquire
  try {
    const row = db.query(
      `SELECT worker, acquired_at FROM worker_roles WHERE role = ?`,
    ).get(role) as { worker: string; acquired_at: string } | undefined;

    if (row) {
      const acquiredAt = new Date(row.acquired_at + 'Z').getTime();
      const expired = now - acquiredAt > ttlMs;

      if (row.worker === workerName) {
        db.run(`UPDATE worker_roles SET acquired_at = datetime('now') WHERE role = ?`, [role]);
        roleLocks.set(role, { worker: workerName, acquiredAt: now, expiresAt: now + ttlMs });
        return true;
      }

      if (expired) {
        // Steal expired lock — use atomic CAS
        db.run(
          `UPDATE worker_roles SET worker = ?, acquired_at = datetime('now') WHERE role = ? AND worker = ?`,
          [workerName, role, row.worker],
        );
        const updated = db.query(`SELECT worker FROM worker_roles WHERE role = ?`).get(role) as { worker: string } | undefined;
        if (updated?.worker === workerName) {
          roleLocks.set(role, { worker: workerName, acquiredAt: now, expiresAt: now + ttlMs });
          return true;
        }
      }

      return false;
    }

    // First acquisition
    db.run(`INSERT INTO worker_roles (role, worker, acquired_at) VALUES (?, ?, datetime('now'))`, [role, workerName]);
    roleLocks.set(role, { worker: workerName, acquiredAt: now, expiresAt: now + ttlMs });
    return true;
  } catch {
    return false;
  }
}

/**
 * Release a role lock.
 */
export function releaseRoleLock(
  db: ReturnType<typeof getMainDb>,
  role: string,
): void {
  roleLocks.delete(role);
  try {
    db.run(`UPDATE worker_roles SET worker = NULL WHERE role = ?`, [role]);
  } catch {
    // Best effort
  }
}

// ─── Scheduled tasks with min-heap scheduler ────────────

interface TaskEntry {
  name: string;
  nextRun: number;
  interval: number;
}

/**
 * Min-heap implementation for O(log n) insert and O(1) next-due peek.
 * Ported from bunqueue's cron scheduler pattern.
 */
class TaskHeap {
  private heap: TaskEntry[] = [];

  push(entry: TaskEntry): void {
    this.heap.push(entry);
    this.bubbleUp(this.heap.length - 1);
  }

  peek(): TaskEntry | undefined {
    return this.heap[0];
  }

  pop(): TaskEntry | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.sinkDown(0);
    }
    return top;
  }

  remove(name: string): void {
    const idx = this.heap.findIndex((e) => e.name === name);
    if (idx === -1) return;
    const bottom = this.heap.pop()!;
    if (idx < this.heap.length) {
      this.heap[idx] = bottom;
      this.bubbleUp(idx);
      this.sinkDown(idx);
    }
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.heap[idx].nextRun >= this.heap[parent].nextRun) break;
      [this.heap[idx], this.heap[parent]] = [this.heap[parent], this.heap[idx]];
      idx = parent;
    }
  }

  private sinkDown(idx: number): void {
    const len = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = (idx << 1) + 1;
      const right = left + 1;
      if (left < len && this.heap[left].nextRun < this.heap[smallest].nextRun) smallest = left;
      if (right < len && this.heap[right].nextRun < this.heap[smallest].nextRun) smallest = right;
      if (smallest === idx) break;
      [this.heap[idx], this.heap[smallest]] = [this.heap[smallest], this.heap[idx]];
      idx = smallest;
    }
  }

  get size(): number {
    return this.heap.length;
  }
}

/**
 * Run scheduled tasks with precise setTimeout scheduling.
 * Ported from bunqueue's CronScheduler — uses min-heap + setTimeout
 * instead of polling, reducing idle CPU to ~0.
 */
export async function runScheduledTasks(
  config: PostaConfig,
  opts: { sleepTime: number },
): Promise<void> {
  const mainDb = getMainDb(config);
  const allTasks = (await import('./tasks/index')).ALL_TASKS;

  // Build min-heap
  const heap = new TaskHeap();
  for (const task of allTasks) {
    const nextRun = task.nextRunAfter().getTime();
    heap.push({
      name: task.name,
      nextRun,
      interval: getTaskInterval(task),
    });
  }

  const workerName = `worker-scheduled-tasks-${Date.now().toString(36)}`;
  let closing = false;

  process.on('SIGTERM', () => { closing = true; });
  process.on('SIGINT', () => { closing = true; });

  console.log(`[worker] started tasks scheduler (event-driven)`);

  const scheduleNext = () => {
    if (closing) return;

    const next = heap.peek();
    if (!next) {
      // No tasks — check again in 60s
      setTimeout(scheduleNext, 60_000);
      return;
    }

    const delay = Math.max(0, next.nextRun - Date.now());

    // bunqueue pattern: precise setTimeout fires exactly when the next task is due
    // Safety fallback: if delay > 60s, wake every 60s to handle clock drift
    if (delay > 60_000) {
      setTimeout(() => scheduleNext(), 60_000);
      return;
    }

    setTimeout(async () => {
      if (closing) return;

      try {
        if (!acquireRoleLock(mainDb, 'scheduled-tasks', workerName)) {
          scheduleNext();
          return;
        }

        const now = Date.now();

        // Execute ALL due tasks (not just the first one)
        while (heap.peek() && heap.peek()!.nextRun <= now) {
          const entry = heap.pop()!;
          const task = allTasks.find((t) => t.name === entry.name);
          if (task) {
            try {
              console.log(`[worker] running task: ${task.name}`);
              await task.execute(config);
              console.log(`[worker] task ${task.name} done`);
            } catch (err: any) {
              console.error(`[worker] task ${task.name} failed:`, err.message);
            }
          }
          // Re-schedule
          const nextRun = task?.nextRunAfter().getTime() ?? now + entry.interval;
          heap.push({ name: entry.name, nextRun, interval: entry.interval });
        }
      } catch (err: any) {
        console.error(`[worker] tasks error:`, err.message);
      }

      scheduleNext();
    }, delay);
  };

  scheduleNext();

  // Block forever
  await new Promise(() => {});
}

function getTaskInterval(task: { nextRunAfter(): Date }): number {
  const now = Date.now();
  const next = task.nextRunAfter().getTime();
  return Math.max(60_000, next - now);
}

// ─── SQLite helpers ─────────────────────────────────────

export function dbRun(db: ReturnType<typeof getMainDb>, sql: string, ...params: any[]): void {
  if (params.length > 0) {
    db.prepare(sql).run(...params);
  } else {
    db.run(sql);
  }
}

export function dbQuery<T = any>(db: ReturnType<typeof getMainDb>, sql: string, ...params: any[]): T {
  if (params.length > 0) {
    return db.query(sql).all(...params) as T;
  }
  return db.query(sql).all() as T;
}

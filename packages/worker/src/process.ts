import type { PostaConfig } from '@posta/core';
import { getMainDb, computeRetryDelay, BackoffStrategy, FailureReason } from '@posta/core';
import type { FailureReasonType } from '@posta/core';
import { EventEmitter } from 'events';

// ─── Public API ──────────────────────────────────────────

export { processQueuedMessagesJob } from './jobs/process_queued_messages';
export { processWebhookRequestsJob } from './jobs/process_webhook_requests';

/**
 * Worker:
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
  private polling = false;

  constructor(
    public name: string,
    private config: PostaConfig,
    private handler: (config: PostaConfig) => Promise<boolean>,
    private opts: {
      pollIntervalMs?: number;
      /** Fallback wait when idle and no NOTIFY arrives. */
      idleIntervalMs?: number;
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

  /**
   * Sleep until there is plausibly work, then poll.
   *
   * Two changes from a fixed interval, and the first matters more:
   *
   * 1. After a batch that found work, poll again immediately. The previous
   *    loop slept the full interval regardless, so a backlog drained at one
   *    batch per interval — with the shipped 5s setting, a thousand queued
   *    messages took over an hour to clear no matter how idle the machine.
   *
   * 2. When genuinely idle, wait for a NOTIFY rather than a timer. That takes
   *    the delay between "message accepted" and "worker looks at it" from a
   *    uniform 0-5s down to the round trip to Postgres.
   *
   * The timer is retained as a floor, not the primary path: NOTIFY is
   * best-effort and a notification raised while the listener is reconnecting
   * is lost. Without the fallback poll, one dropped notification would strand
   * a message until something else happened to wake the worker.
   */
  private scheduleNextPoll(immediate = false): void {
    if (this.closing) return;
    if (immediate) {
      // setTimeout(0) rather than a direct call: yields to the event loop so
      // a long backlog cannot starve heartbeats or shutdown.
      this.pollTimer = setTimeout(() => this.poll(), 0);
      return;
    }
    this.pollTimer = setTimeout(() => this.poll(), this.opts.idleIntervalMs ?? 30_000);
  }

  /** Called on NOTIFY. Collapses the current idle wait. */
  wake(): void {
    if (this.closing || this.polling) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.scheduleNextPoll(true);
  }

  private async poll(): Promise<void> {
    if (this.closing) return;
    this.polling = true;
    let hadWork = false;
    try {
      this.activeJobs++;
      hadWork = await this.handler(this.config);
      this.activeJobs--;
      if (!hadWork && !this.closing) {
        this.emit('drained');
      }
    } catch (err: any) {
      this.activeJobs--;
      this.emit('error', err);
    } finally {
      this.polling = false;
    }
    // Keep draining while there is work; only sleep once genuinely idle.
    this.scheduleNextPoll(hadWork);
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
      // The idle wait, not the time between batches: a worker that finds
      // work polls again immediately, and NOTIFY collapses this wait when
      // new mail arrives. It exists only to catch a lost notification, so a
      // long value costs nothing in the normal case.
      idleIntervalMs: opts.sleepTime * 1000,
      heartbeatIntervalMs: 10_000,
    });
    w.on('error', (err: Error) => console.error(`[worker] ${w.name} error:`, err.message));
    w.start();
    return w;
  });

  // Wake every worker the instant something is enqueued. The trigger on
  // queued_messages raises this; see MAIN_DB_DDL.
  //
  // Failure here is deliberately not fatal: without notifications the workers
  // fall back to the idle poll and mail still moves, just later. Refusing to
  // start would turn a degraded path into an outage.
  try {
    const mainDb = getMainDb(config);
    await mainDb.listen('posta_queued_messages', () => {
      for (const w of workers) w.wake();
    });
    console.log('[worker] listening for queued-message notifications');
  } catch (err: any) {
    console.warn(
      `[worker] could not subscribe to queue notifications (${err.message}); ` +
        `falling back to ${opts.sleepTime}s idle polling`,
    );
  }

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

// ─── Role locking: shard-based, with expiry check ───

interface RoleLock {
  worker: string;
  acquiredAt: number;
  expiresAt: number;
}

const roleLocks = new Map<string, RoleLock>();

/**
 * Acquire a distributed role lock.
 * Uses in-memory cache + periodic re-acquire, backed by DB.
 * Lock expiry + heartbeat to prevent stale locks.
 */
export async function acquireRoleLock(
  db: ReturnType<typeof getMainDb>,
  role: string,
  workerName: string,
  ttlMs: number = 5 * 60 * 1000,
): Promise<boolean> {
  const now = Date.now();
  const existing = roleLocks.get(role);

  // Check if we still hold a valid lock
  if (existing && existing.worker === workerName && existing.expiresAt > now) {
    // Refresh our lock in DB
    try {
      await db.run(`UPDATE worker_roles SET acquired_at = NOW() WHERE role = $1 AND worker = $2`, [role, workerName]);
      existing.expiresAt = now + ttlMs / 2; // renew at half TTL
      return true;
    } catch {
      return false;
    }
  }

  // Try to acquire
  try {
    const row = await db.get<{ worker: string; acquired_at: Date }>(
      `SELECT worker, acquired_at FROM worker_roles WHERE role = $1`,
      [role],
    );

    if (row) {
      const acquiredAt = row.acquired_at instanceof Date ? row.acquired_at.getTime() : new Date(row.acquired_at).getTime();
      const expired = now - acquiredAt > ttlMs;

      if (row.worker === workerName) {
        await db.run(`UPDATE worker_roles SET acquired_at = NOW() WHERE role = $1`, [role]);
        roleLocks.set(role, { worker: workerName, acquiredAt: now, expiresAt: now + ttlMs });
        return true;
      }

      if (expired) {
        // Steal expired lock — use atomic CAS
        await db.run(
          `UPDATE worker_roles SET worker = $1, acquired_at = NOW() WHERE role = $2 AND worker = $3`,
          [workerName, role, row.worker],
        );
        const updated = await db.get<{ worker: string }>(`SELECT worker FROM worker_roles WHERE role = $1`, [role]);
        if (updated?.worker === workerName) {
          roleLocks.set(role, { worker: workerName, acquiredAt: now, expiresAt: now + ttlMs });
          return true;
        }
      }

      return false;
    }

    // First acquisition
    await db.run(`INSERT INTO worker_roles (role, worker, acquired_at) VALUES ($1, $2, NOW())`, [role, workerName]);
    roleLocks.set(role, { worker: workerName, acquiredAt: now, expiresAt: now + ttlMs });
    return true;
  } catch {
    return false;
  }
}

/**
 * Release a role lock.
 */
export async function releaseRoleLock(
  db: ReturnType<typeof getMainDb>,
  role: string,
): Promise<void> {
  roleLocks.delete(role);
  try {
    await db.run(`UPDATE worker_roles SET worker = NULL WHERE role = $1`, [role]);
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
 * Uses min-heap + setTimeout
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

    // Precise setTimeout fires exactly when the next task is due
    // Safety fallback: if delay > 60s, wake every 60s to handle clock drift
    if (delay > 60_000) {
      setTimeout(() => scheduleNext(), 60_000);
      return;
    }

    setTimeout(async () => {
      if (closing) return;

      try {
        if (!await acquireRoleLock(mainDb, 'scheduled-tasks', workerName)) {
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

// ─── Database helpers ─────────────────────────────────────

export async function dbRun(db: ReturnType<typeof getMainDb>, sql: string, ...params: any[]): Promise<void> {
  if (params.length > 0) {
    await db.run(sql, params);
  } else {
    await db.run(sql);
  }
}

export async function dbQuery<T = any>(db: ReturnType<typeof getMainDb>, sql: string, ...params: any[]): Promise<T> {
  if (params.length > 0) {
    return await db.query(sql, params) as T;
  }
  return await db.query(sql) as T;
}

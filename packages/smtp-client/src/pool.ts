import type { SmtpSession } from './session';

/**
 * Reusable SMTP connections, keyed by destination.
 *
 * The single largest saving available on the delivery path, and — less
 * obviously — a deliverability feature rather than only a latency one.
 *
 * Opening a connection per message costs a TCP handshake and a TLS handshake
 * every time, which against a mailbox provider is 100-150ms of pure waiting.
 * Worse, it is the behaviour every large provider rate-limits: Gmail and
 * Microsoft both throttle clients that reconnect per message, throttling
 * means deferrals, and deferrals are measured in minutes rather than
 * milliseconds. So per-message connections lose twice — slower per message,
 * then far slower once the provider notices.
 *
 * Three limits, each for a different failure:
 *
 *   maxPerKey      A provider refuses too many simultaneous connections from
 *                  one client, so concurrency is capped per destination
 *                  rather than globally.
 *   maxUses        Providers also cap messages per connection and simply
 *                  close it at the limit. Retiring first turns a mid-
 *                  transaction disconnect into an ordinary reconnect.
 *   idleTimeoutMs  An idle connection is closed by the far end without
 *                  telling us. Retiring ours first avoids handing a message
 *                  to a socket that is already dead.
 */

export interface PoolOptions {
  /** Maximum idle connections held per destination. */
  maxPerKey?: number;
  /** Retire a connection after this many messages. */
  maxUses?: number;
  /** Retire a connection idle for longer than this. */
  idleTimeoutMs?: number;
}

interface Pooled {
  session: SmtpSession;
  uses: number;
  idleSince: number;
}

export interface PoolStats {
  created: number;
  reused: number;
  retired: number;
  idle: number;
  /** Messages per connection. The number pooling exists to raise. */
  reuseRatio: number;
}

const DEFAULTS = {
  maxPerKey: 4,
  // Conservative: documented ceilings are higher, but the cost of retiring
  // early is one extra handshake, and the cost of retiring late is a failed
  // transaction part-way through a message.
  maxUses: 100,
  // Well inside the ~5 minute idle timeout most providers use.
  idleTimeoutMs: 60_000,
};

export class SmtpConnectionPool {
  private idle = new Map<string, Pooled[]>();
  private options: Required<PoolOptions>;
  private created = 0;
  private reused = 0;
  private retired = 0;

  constructor(options: PoolOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /**
   * Run `fn` against a connection for `key`, reusing one where possible.
   *
   * The connection returns to the pool afterwards unless it is unusable, and
   * is destroyed rather than pooled if `fn` threw. A connection whose
   * transaction failed part-way may have unread replies buffered, and reusing
   * it would give the *next* message someone else's response — so a throw
   * always retires it.
   */
  async withConnection<T>(
    key: string,
    connect: () => Promise<SmtpSession>,
    fn: (session: SmtpSession) => Promise<T>,
  ): Promise<T> {
    const pooled = this.take(key);
    const entry: Pooled = pooled ?? {
      session: await this.open(connect),
      uses: 0,
      idleSince: Date.now(),
    };
    if (pooled) this.reused++;

    try {
      const result = await fn(entry.session);
      entry.uses++;
      this.release(key, entry);
      return result;
    } catch (error) {
      // Never pool a connection whose transaction threw: its reply stream may
      // be desynchronised, and the damage would land on a later message.
      this.destroy(entry);
      throw error;
    }
  }

  private async open(connect: () => Promise<SmtpSession>): Promise<SmtpSession> {
    this.created++;
    return connect();
  }

  /** An idle connection for `key`, if one is still usable. */
  private take(key: string): Pooled | undefined {
    const bucket = this.idle.get(key);
    if (!bucket) return undefined;

    while (bucket.length > 0) {
      // Most-recently used first: the freshest connection is the least likely
      // to have been closed by the far end.
      const entry = bucket.pop()!;
      if (this.isStale(entry)) {
        this.destroy(entry);
        continue;
      }
      return entry;
    }
    return undefined;
  }

  private isStale(entry: Pooled): boolean {
    if (entry.uses >= this.options.maxUses) return true;
    return Date.now() - entry.idleSince > this.options.idleTimeoutMs;
  }

  private release(key: string, entry: Pooled): void {
    if (entry.uses >= this.options.maxUses) {
      this.destroy(entry);
      return;
    }

    const bucket = this.idle.get(key) ?? [];
    if (bucket.length >= this.options.maxPerKey) {
      // Already holding enough for this destination. Closing the surplus is
      // better than holding connections a provider counts against us.
      this.destroy(entry);
      return;
    }

    entry.idleSince = Date.now();
    bucket.push(entry);
    this.idle.set(key, bucket);
  }

  private destroy(entry: Pooled): void {
    this.retired++;
    try {
      (entry.session as unknown as { close?: () => void }).close?.();
    } catch {
      // A connection being retired is already unusable; a failure closing it
      // changes nothing and must not propagate into the delivery path.
    }
  }

  /** Close every idle connection. For shutdown, and between test cases. */
  drain(): void {
    for (const bucket of this.idle.values()) {
      for (const entry of bucket) this.destroy(entry);
    }
    this.idle.clear();
  }

  stats(): PoolStats {
    let idle = 0;
    for (const bucket of this.idle.values()) idle += bucket.length;
    return {
      created: this.created,
      reused: this.reused,
      retired: this.retired,
      idle,
      reuseRatio: this.created === 0 ? 0 : (this.created + this.reused) / this.created,
    };
  }
}

/** Pool key for one destination. Port matters: 25 and 587 are not the same peer. */
export function poolKey(host: string, port: number): string {
  return `${host.toLowerCase()}:${port}`;
}

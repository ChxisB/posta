import type { MessageDatabase } from './database';

/**
 * Live stats — per-minute counters for the last 60 minutes.
 *
 * Mirrors the Ruby LiveStats class.
 * Uses INSERT OR REPLACE for upsert semantics.
 */
export class LiveStatsStore {
  private db: MessageDatabase;

  constructor(db: MessageDatabase) {
    this.db = db;
  }

  /**
   * Increment a counter for the current minute.
   */
  increment(type: string): void {
    const now = new Date();
    const minute = now.getUTCMinutes();
    const timestamp = now.getTime() / 1000;

    this.db.exec(
      `INSERT INTO live_stats (type, minute, count, timestamp) ` +
      `VALUES ('${type}', ${minute}, 1, ${timestamp}) ` +
      `ON CONFLICT(minute, type) DO UPDATE SET ` +
      `count = CASE WHEN timestamp < ${timestamp - 1800} THEN 1 ELSE count + 1 END, ` +
      `timestamp = ${timestamp}`,
    );
  }

  /**
   * Return the total number of messages for the last N minutes.
   */
  total(minutes: number, options: { types?: string[] } = {}): number {
    if (minutes > 60) {
      throw new Error('Live stats can only return data for the last 60 minutes.');
    }

    const types = (options.types ?? ['incoming', 'outgoing'])
      .map((t) => `'${t}'`)
      .join(', ');

    if (types.length === 0) {
      throw new Error('You must provide at least one type to return');
    }

    const cutoff = (Date.now() / 1000) - (minutes * 60);
    const rows = this.db.query<{ count: number | null }>(
      `SELECT COALESCE(SUM(count), 0) AS count FROM live_stats ` +
      `WHERE type IN (${types}) AND timestamp > ${cutoff}`,
    );
    return rows[0]?.count ?? 0;
  }
}

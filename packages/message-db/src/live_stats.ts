import type { MessageDatabase } from './database';

/**
 * Live stats — per-minute counters for the last 60 minutes.
 *
 * Mirrors the Ruby LiveStats class.
 * Uses PostgreSQL ON CONFLICT for upsert semantics.
 */
export class LiveStatsStore {
  private db: MessageDatabase;

  constructor(db: MessageDatabase) {
    this.db = db;
  }

  /**
   * Increment a counter for the current minute.
   */
  async increment(type: string): Promise<void> {
    const now = new Date();
    const minute = now.getUTCMinutes();
    const timestamp = now.getTime() / 1000;

    await this.db.run(
      `INSERT INTO live_stats (type, minute, count, timestamp) ` +
      `VALUES ($1, $2, 1, $3) ` +
      `ON CONFLICT(minute, type) DO UPDATE SET ` +
      `count = CASE WHEN live_stats.timestamp < $4 THEN 1 ELSE live_stats.count + 1 END, ` +
      `timestamp = $5`,
      [type, minute, timestamp, timestamp - 1800, timestamp],
    );
  }

  /**
   * Return the total number of messages for the last N minutes.
   */
  async total(minutes: number, options: { types?: string[] } = {}): Promise<number> {
    if (minutes > 60) {
      throw new Error('Live stats can only return data for the last 60 minutes.');
    }

    const types = options.types ?? ['incoming', 'outgoing'];
    if (types.length === 0) {
      throw new Error('You must provide at least one type to return');
    }

    const placeholders = types.map((_, i) => `$${i + 1}`).join(', ');
    const cutoff = (Date.now() / 1000) - (minutes * 60);
    const params = [...types, cutoff];
    const rows = await this.db.query<{ count: number | null }>(
      `SELECT COALESCE(SUM(count), 0) AS count FROM live_stats ` +
      `WHERE type IN (${placeholders}) AND timestamp > $${params.length}`,
      params,
    );
    return rows[0]?.count ?? 0;
  }
}

import type { MessageDatabase } from './database';

/**
 * Statistics periods matching the Ruby STATS_GAPS.
 */
const STATS_PERIODS = ['hourly', 'daily', 'monthly', 'yearly'] as const;
const COUNTERS = ['incoming', 'outgoing', 'spam', 'bounces', 'held'] as const;

type StatsPeriod = typeof STATS_PERIODS[number];
type StatsCounter = typeof COUNTERS[number];

/**
 * Rollup statistics — mirrors the Ruby Statistics class.
 *
 * Tracks aggregate counters across hourly/daily/monthly/yearly tables.
 * Uses INSERT OR REPLACE (SQLite equivalent of MySQL's ON DUPLICATE KEY UPDATE).
 */
export class StatisticsStore {
  private db: MessageDatabase;

  constructor(db: MessageDatabase) {
    this.db = db;
  }

  /**
   * Increment a single stats counter for a given period.
   */
  incrementOne(period: StatsPeriod, field: StatsCounter, time: Date = new Date()): void {
    const timeKey = this.getPeriodStart(period, time);
    const initialValues = COUNTERS.map((c) => (c === field ? 1 : 0));

    // SQLite equivalent of ON DUPLICATE KEY UPDATE
    this.db.exec(
      `INSERT INTO stats_${period} (time, ${COUNTERS.join(', ')}) ` +
      `VALUES (${timeKey}, ${initialValues.join(', ')}) ` +
      `ON CONFLICT(time) DO UPDATE SET ${field} = ${field} + 1`,
    );
  }

  /**
   * Increment all stats counters (hourly, daily, monthly, yearly) for a given field.
   */
  incrementAll(time: Date, field: StatsCounter): void {
    for (const period of STATS_PERIODS) {
      this.incrementOne(period, field, time);
    }
  }

  /**
   * Get statistics for a given period and counters.
   *
   * Returns an array of [time, counters] pairs, ordered chronologically.
   */
  get(
    period: StatsPeriod,
    counters: StatsCounter[],
    startDate: Date = new Date(),
    quantity: number = 10,
  ): Array<{ time: Date; counters: Record<string, number> }> {
    // Build the expected time slots
    const slots = new Map<number, Record<string, number>>();
    for (let i = 0; i < quantity; i++) {
      const slotTime = this.subtractPeriod(period, startDate, i);
      const slotKey = this.getPeriodStart(period, slotTime);
      const initial: Record<string, number> = {};
      for (const c of counters) {
        initial[c] = 0;
      }
      slots.set(slotKey, initial);
    }

    // Fetch actual data
    const timeKeys = [...slots.keys()];
    const rows = this.db.query<Record<string, unknown>>(
      `SELECT time, ${counters.join(', ')} FROM stats_${period} WHERE time IN (${timeKeys.join(',')})`,
    );

    for (const row of rows) {
      const t = Number(row.time);
      if (slots.has(t)) {
        const slot = slots.get(t)!;
        for (const c of counters) {
          slot[c] = Number(row[c]) || 0;
        }
      }
    }

    // Return as chronologically ordered array
    return [...slots.entries()]
      .sort(([a], [b]) => a - b)
      .map(([timeKey, counters]) => ({
        time: new Date(timeKey * 1000),
        counters,
      }));
  }

  /**
   * Get the Unix timestamp for the start of a period.
   */
  private getPeriodStart(period: StatsPeriod, date: Date): number {
    const d = new Date(date);
    switch (period) {
      case 'hourly':
        d.setUTCMinutes(0, 0, 0);
        break;
      case 'daily':
        d.setUTCHours(0, 0, 0, 0);
        break;
      case 'monthly':
        d.setUTCDate(1);
        d.setUTCHours(0, 0, 0, 0);
        break;
      case 'yearly':
        d.setUTCMonth(0, 1);
        d.setUTCHours(0, 0, 0, 0);
        break;
    }
    return Math.floor(d.getTime() / 1000);
  }

  /**
   * Subtract a number of periods from a date.
   */
  private subtractPeriod(period: StatsPeriod, date: Date, count: number): Date {
    const d = new Date(date);
    switch (period) {
      case 'hourly':
        d.setUTCHours(d.getUTCHours() - count);
        break;
      case 'daily':
        d.setUTCDate(d.getUTCDate() - count);
        break;
      case 'monthly':
        d.setUTCMonth(d.getUTCMonth() - count);
        break;
      case 'yearly':
        d.setUTCFullYear(d.getUTCFullYear() - count);
        break;
    }
    return d;
  }
}

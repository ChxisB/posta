import type { PostaConfig } from '@posta/core';
import { getMainDb, PARTITIONED_TABLES, partitionDDL, partitionsToEnsure } from '@posta/core';
import type { ScheduledTask } from './index';

/**
 * Keeps future partitions in existence.
 *
 * A RANGE-partitioned table rejects any row whose partition key falls outside
 * every child. There is no overflow partition and no implicit creation: the
 * insert simply fails with "no partition of relation found for row". For a
 * message store that means dropping mail, at midnight, on the first of the
 * month, across every tenant at once — the worst failure this system has.
 *
 * So partitions are created months ahead rather than on demand:
 *
 *   - creating them lazily on insert puts DDL on the hot path and serialises
 *     every writer behind an ACCESS EXCLUSIVE lock at the exact moment
 *     traffic rolls into a new month
 *   - creating them one month ahead leaves no room for this task to fail
 *     unnoticed
 *
 * Running two months ahead means the task has to be broken for eight weeks
 * before it can drop a message — long enough for the failure below to be
 * noticed.
 */
export const maintainPartitionsTask: ScheduledTask = {
  name: 'maintain-partitions',

  /**
   * Hourly, not monthly. The work is idempotent and costs nothing when there
   * is nothing to do, and running often means a deploy that happens to miss
   * a monthly window does not leave the gap open until the next one.
   */
  nextRunAfter(): Date {
    const next = new Date();
    next.setUTCMinutes(5, 0, 0);
    if (next <= new Date()) next.setUTCHours(next.getUTCHours() + 1);
    return next;
  },

  async execute(config: PostaConfig): Promise<void> {
    const db = getMainDb(config);
    const months = partitionsToEnsure(new Date());

    let ensured = 0;
    for (const table of PARTITIONED_TABLES) {
      for (const { year, month } of months) {
        // IF NOT EXISTS makes this idempotent, so a partition created by an
        // earlier run or by a deploy is left alone rather than erroring.
        await db.exec(partitionDDL(table, year, month));
        ensured++;
      }
    }

    // Verify rather than trust. A CREATE that silently did nothing — because
    // of a permissions change, or a table renamed out from under us — would
    // otherwise stay invisible until the month rolled over and inserts began
    // failing.
    const missing = await findMissingPartitions(db, months);
    if (missing.length > 0) {
      throw new Error(
        `partition maintenance ran but ${missing.length} partition(s) are still missing: ` +
          `${missing.join(', ')}. Inserts will fail once that range is reached.`,
      );
    }

    const last = months[months.length - 1];
    console.log(
      `[maintain-partitions] verified ${ensured} partition(s) across ` +
        `${PARTITIONED_TABLES.length} tables through ` +
        `${last.year}-${String(last.month).padStart(2, '0')}`,
    );
  },
};

/** Partition names that should exist for these months but do not. */
export async function findMissingPartitions(
  db: ReturnType<typeof getMainDb>,
  months: Array<{ year: number; month: number }>,
): Promise<string[]> {
  const expected = PARTITIONED_TABLES.flatMap((table) =>
    months.map(({ year, month }) => `${table}_${year}${String(month).padStart(2, '0')}`),
  );

  const rows = await db.query<{ relname: string }>(
    `SELECT c.relname
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema()
        AND c.relkind = 'r'
        AND c.relname = ANY($1)`,
    [expected],
  );

  const present = new Set(rows.map((r) => r.relname));
  return expected.filter((name) => !present.has(name));
}

/**
 * Detach partitions older than `retainMonths` and return their names.
 *
 * Detach, never DROP. Detaching removes the partition from the parent in
 * milliseconds and leaves the data as a standalone table, which can then be
 * archived to object storage and dropped deliberately. A task that dropped
 * mail history on a schedule would be one bad `retainMonths` away from
 * destroying the only record of what a customer sent — and retention is
 * exactly the kind of setting that gets changed in a hurry during an
 * incident.
 *
 * Deliberately not wired into the scheduled task above. Retention is a
 * per-tenant contractual matter and belongs behind an explicit operator
 * action, not a cron job.
 */
export async function detachOldPartitions(
  db: ReturnType<typeof getMainDb>,
  retainMonths: number,
  now: Date = new Date(),
): Promise<string[]> {
  if (retainMonths < 1) throw new Error('retainMonths must be at least 1');

  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - retainMonths, 1));
  const cutoffKey = cutoff.getUTCFullYear() * 100 + (cutoff.getUTCMonth() + 1);
  const detached: string[] = [];

  for (const table of PARTITIONED_TABLES) {
    const rows = await db.query<{ relname: string }>(
      `SELECT c.relname
         FROM pg_inherits i
         JOIN pg_class c ON c.oid = i.inhrelid
         JOIN pg_class p ON p.oid = i.inhparent
        WHERE p.relname = $1`,
      [table],
    );

    for (const { relname } of rows) {
      const suffix = relname.slice(table.length + 1);
      // Only touch children whose name is the YYYYMM this module generates.
      // A partition attached by hand, or by a future scheme, is left alone.
      if (!/^\d{6}$/.test(suffix)) continue;
      if (Number(suffix) >= cutoffKey) continue;

      await db.exec(`ALTER TABLE ${table} DETACH PARTITION ${relname}`);
      detached.push(relname);
    }
  }

  return detached;
}

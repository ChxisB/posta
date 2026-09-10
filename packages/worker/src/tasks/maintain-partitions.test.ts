import { describe, expect, it } from 'bun:test';
import { detachOldPartitions, findMissingPartitions } from './maintain-partitions';

/**
 * A stub standing in for PgClient. These tests are about which statements
 * would be issued, not about Postgres executing them — the schema itself is
 * verified against a real server separately.
 */
function stubDb(partitionsByTable: Record<string, string[]>, existing: string[] = []) {
  const executed: string[] = [];
  return {
    executed,
    async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
      if (sql.includes('pg_inherits')) {
        const table = (params?.[0] as string) ?? '';
        return (partitionsByTable[table] ?? []).map((relname) => ({ relname })) as T[];
      }
      // findMissingPartitions' existence probe.
      const wanted = (params?.[0] as string[]) ?? [];
      return wanted.filter((n) => existing.includes(n)).map((relname) => ({ relname })) as T[];
    },
    async exec(sql: string): Promise<void> {
      executed.push(sql.trim());
    },
  } as never as Parameters<typeof detachOldPartitions>[0] & { executed: string[] };
}

const NOW = new Date('2026-09-15T00:00:00Z');

describe('detachOldPartitions', () => {
  it('detaches only partitions older than the retention window', async () => {
    const db = stubDb({
      messages: ['messages_202601', 'messages_202606', 'messages_202607', 'messages_202609'],
    });
    // Retaining 3 months from 2026-09 puts the cutoff at 2026-06.
    expect(await detachOldPartitions(db, 3, NOW)).toEqual(['messages_202601']);
  });

  it('never detaches the current month', async () => {
    // Detaching the live partition would make every insert fail immediately.
    const db = stubDb({ messages: ['messages_202609'] });
    expect(await detachOldPartitions(db, 1, NOW)).toEqual([]);
  });

  it('detaches, never drops', async () => {
    const db = stubDb({ messages: ['messages_202001'] });
    await detachOldPartitions(db, 3, NOW);
    expect(db.executed[0]).toContain('DETACH PARTITION');
    // The data must survive as a standalone table so it can be archived
    // deliberately. A scheduled DROP is one bad config value away from
    // destroying the only record of what a customer sent.
    expect(db.executed.join(' ')).not.toContain('DROP');
  });

  it('leaves partitions it did not name alone', async () => {
    // A child attached by hand, or by some future scheme, is not ours to
    // remove — the YYYYMM suffix is the only thing this module recognises.
    const db = stubDb({
      messages: ['messages_202001', 'messages_archive_old', 'messages_manual', 'messages_2020'],
    });
    expect(await detachOldPartitions(db, 3, NOW)).toEqual(['messages_202001']);
  });

  it('handles the cutoff crossing a year boundary', async () => {
    const db = stubDb({ messages: ['messages_202511', 'messages_202512', 'messages_202601'] });
    // From 2026-02, retaining 3 months → cutoff 2025-11, so nothing is older.
    expect(await detachOldPartitions(db, 3, new Date('2026-02-10T00:00:00Z'))).toEqual([]);
  });

  it('refuses a retention of zero rather than detaching everything', async () => {
    // The dangerous typo: retainMonths: 0 would otherwise detach the live
    // partition and stop all mail.
    const db = stubDb({ messages: ['messages_202609'] });
    await expect(detachOldPartitions(db, 0, NOW)).rejects.toThrow('at least 1');
  });

  it('sweeps every partitioned table, not just messages', async () => {
    const db = stubDb({
      messages: ['messages_202001'],
      deliveries: ['deliveries_202001'],
      clicks: ['clicks_202001'],
    });
    const detached = await detachOldPartitions(db, 3, NOW);
    expect(detached).toContain('messages_202001');
    expect(detached).toContain('deliveries_202001');
    expect(detached).toContain('clicks_202001');
  });
});

describe('findMissingPartitions', () => {
  const months = [{ year: 2026, month: 9 }];

  it('reports nothing when every expected partition exists', async () => {
    const all = [
      'messages_202609',
      'deliveries_202609',
      'links_202609',
      'clicks_202609',
      'loads_202609',
      'spam_checks_202609',
    ];
    expect(await findMissingPartitions(stubDb({}, all), months)).toEqual([]);
  });

  it('names what is missing, so the alert is actionable', async () => {
    const missing = await findMissingPartitions(stubDb({}, ['messages_202609']), months);
    expect(missing).toContain('deliveries_202609');
    expect(missing).not.toContain('messages_202609');
  });

  it('reports everything missing when the DDL silently did nothing', async () => {
    // The case this guards: a permissions change means CREATE succeeds as a
    // no-op, and nothing surfaces until inserts start failing next month.
    expect(await findMissingPartitions(stubDb({}, []), months)).toHaveLength(6);
  });
});

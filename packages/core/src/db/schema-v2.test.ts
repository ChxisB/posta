import { describe, expect, it } from 'bun:test';
import { PARTITIONED_TABLES, partitionDDL, partitionsToEnsure } from './schema-v2';

describe('partitionDDL', () => {
  it("bounds a month from its first day to the next month's first day", () => {
    // Half-open [start, end): the upper bound is the next month, so no row
    // can fall between two partitions and none can match both.
    const ddl = partitionDDL('messages', 2026, 9);
    expect(ddl).toContain('messages_202609');
    expect(ddl).toContain("FROM ('2026-09-01') TO ('2026-10-01')");
  });

  it('rolls the year over at December', () => {
    // The off-by-one that would otherwise ship in December and drop mail on
    // 1 January, when inserts find no partition.
    const ddl = partitionDDL('messages', 2026, 12);
    expect(ddl).toContain("FROM ('2026-12-01') TO ('2027-01-01')");
  });

  it('zero-pads single-digit months so names sort chronologically', () => {
    expect(partitionDDL('messages', 2026, 3)).toContain('messages_202603');
  });

  it('is idempotent, so a re-run cannot fail a deploy', () => {
    expect(partitionDDL('deliveries', 2026, 1)).toContain('IF NOT EXISTS');
  });

  it('handles a leap February', () => {
    const ddl = partitionDDL('messages', 2028, 2);
    expect(ddl).toContain("FROM ('2028-02-01') TO ('2028-03-01')");
  });
});

describe('partitionsToEnsure', () => {
  it('covers the current month plus two ahead by default', () => {
    const out = partitionsToEnsure(new Date('2026-09-15T00:00:00Z'));
    expect(out).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
    ]);
  });

  it('crosses the year boundary', () => {
    const out = partitionsToEnsure(new Date('2026-11-20T00:00:00Z'));
    expect(out).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
  });

  it('always includes the current month, so today can always be written', () => {
    // If this ever returned only future months, every insert would fail
    // immediately rather than at some later boundary.
    for (const month of [1, 6, 12]) {
      const out = partitionsToEnsure(new Date(Date.UTC(2026, month - 1, 28)));
      expect(out[0]).toEqual({ year: 2026, month });
    }
  });

  it('runs far enough ahead to be an alert rather than an outage', () => {
    // Two months of slack: a failed scheduled task has to go unnoticed for
    // over eight weeks before it can drop mail.
    expect(partitionsToEnsure(new Date('2026-09-01T00:00:00Z'))).toHaveLength(3);
  });

  it('is stable regardless of the day or time within the month', () => {
    const first = partitionsToEnsure(new Date('2026-09-01T00:00:00Z'));
    const last = partitionsToEnsure(new Date('2026-09-30T23:59:59Z'));
    expect(first).toEqual(last);
  });
});

describe('PARTITIONED_TABLES', () => {
  it('lists every time-series table', () => {
    expect([...PARTITIONED_TABLES].sort()).toEqual([
      'clicks',
      'deliveries',
      'links',
      'loads',
      'messages',
      'spam_checks',
    ]);
  });

  it('excludes suppressions, which are state rather than events', () => {
    // Suppressions must not age out of a partition: an address that
    // hard-bounced is still suppressed next year, and sending to it again is
    // how sender reputation is destroyed.
    expect([...PARTITIONED_TABLES]).not.toContain('suppressions');
  });
});

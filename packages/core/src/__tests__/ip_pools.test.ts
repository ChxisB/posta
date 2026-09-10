import { describe, it, expect, beforeAll } from 'bun:test';
import { allocateIpAddress } from '../ip_pools';
import type { Queryable, Row } from '../db/client';

/**
 * In-memory mock Queryable for testing IP pool logic without a real database.
 */
class MockQueryable implements Queryable {
  private tables: Record<string, Record<string, unknown>[]> = {};

  private table(name: string): Record<string, unknown>[] {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }

  async query<T = Record<string, unknown>>(sql: string, params?: any[]): Promise<T[]> {
    // Simple SQL parsing for the specific queries used by allocateIpAddress.
    const lower = sql.toLowerCase();
    if (lower.includes('from servers')) {
      return this.table('servers').filter((r) => r.id === params?.[0]) as T[];
    }
    if (lower.includes('from ip_pool_rules') && lower.includes("owner_type = 'server'")) {
      return this.table('ip_pool_rules')
        .filter((r) => r.owner_type === 'Server' && r.owner_id === params?.[0])
        .sort((a, b) => ((b.created_at as number) ?? 0) - ((a.created_at as number) ?? 0)) as T[];
    }
    if (lower.includes('from ip_pool_rules') && lower.includes("owner_type = 'organization'")) {
      return this.table('ip_pool_rules')
        .filter((r) => r.owner_type === 'Organization' && r.owner_id === params?.[0])
        .sort((a, b) => ((b.created_at as number) ?? 0) - ((a.created_at as number) ?? 0)) as T[];
    }
    if (lower.includes('from ip_addresses')) {
      return this.table('ip_addresses').filter((r) => r.ip_pool_id === params?.[0]) as T[];
    }
    return [];
  }

  async get<T = Record<string, unknown>>(sql: string, params?: any[]): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  async run(): Promise<{ changes: number; lastInsertRowid?: number | bigint }> {
    return { changes: 0 };
  }

  async exec(): Promise<void> {}

  async transaction<T>(fn: (client: Queryable) => Promise<T>): Promise<T> {
    return fn(this);
  }

  seed(tableName: string, rows: Record<string, unknown>[]): void {
    this.tables[tableName] = rows;
  }
}

const db = new MockQueryable();

beforeAll(() => {
  db.seed('organizations', [{ id: 1, uuid: 'org1', name: 'Org 1', permalink: 'org1' }]);
  db.seed('servers', [{ id: 1, organization_id: 1, uuid: 'srv1', name: 'Srv 1', permalink: 'srv1' }]);
  db.seed('ip_pools', [{ id: 1, uuid: 'pool1', name: 'Pool 1' }]);
  db.seed('ip_pool_rules', [{ uuid: 'rule1', owner_type: 'Server', owner_id: 1, ip_pool_id: 1, to_text: 'example.com', created_at: 1 }]);
  db.seed('ip_addresses', [
    { id: 1, ip_pool_id: 1, ipv4: '203.0.113.10', priority: 100 },
    { id: 2, ip_pool_id: 1, ipv4: '203.0.113.20', priority: 50 },
  ]);
});

describe('allocateIpAddress', () => {
  it('returns null when useIpPools is false', async () => {
    const result = await allocateIpAddress(db, false, 1, 'outgoing', 'user@example.com');
    expect(result).toBeNull();
  });

  it('returns null when scope is not outgoing', async () => {
    const result = await allocateIpAddress(db, true, 1, 'incoming', 'user@example.com');
    expect(result).toBeNull();
  });

  it('returns null when no rules match', async () => {
    const result = await allocateIpAddress(db, true, 1, 'outgoing', 'user@other.com');
    expect(result).toBeNull();
  });

  it('returns an ip_address_id when a rule matches', async () => {
    const result = await allocateIpAddress(db, true, 1, 'outgoing', 'user@example.com');
    expect(result).not.toBeNull();
    expect([1, 2]).toContain(result as number);
  });

  it('returns null when server does not exist', async () => {
    const result = await allocateIpAddress(db, true, 999, 'outgoing', 'user@example.com');
    expect(result).toBeNull();
  });
});

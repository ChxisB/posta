import { describe, it, expect, beforeAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { allocateIpAddress } from '../ip_pools';
import { MAIN_DB_DDL } from '../db/schema';

const db = new Database(':memory:');
db.run(MAIN_DB_DDL);

beforeAll(() => {
  db.run(`INSERT INTO organizations (id, uuid, name, permalink) VALUES (1, 'org1', 'Org 1', 'org1')`);
  db.run(`INSERT INTO servers (id, organization_id, uuid, name, permalink) VALUES (1, 1, 'srv1', 'Srv 1', 'srv1')`);
  db.run(`INSERT INTO ip_pools (id, uuid, name) VALUES (1, 'pool1', 'Pool 1')`);
  db.run(`INSERT INTO ip_pool_rules (uuid, owner_type, owner_id, ip_pool_id, to_text) VALUES ('rule1', 'Server', 1, 1, 'example.com')`);
  db.run(`INSERT INTO ip_addresses (id, ip_pool_id, ipv4, priority) VALUES (1, 1, '203.0.113.10', 100)`);
  db.run(`INSERT INTO ip_addresses (id, ip_pool_id, ipv4, priority) VALUES (2, 1, '203.0.113.20', 50)`);
});

describe('allocateIpAddress', () => {
  it('returns null when useIpPools is false', () => {
    const result = allocateIpAddress(db, false, 1, 'outgoing', 'user@example.com');
    expect(result).toBeNull();
  });

  it('returns null when scope is not outgoing', () => {
    const result = allocateIpAddress(db, true, 1, 'incoming', 'user@example.com');
    expect(result).toBeNull();
  });

  it('returns null when no rules match', () => {
    const result = allocateIpAddress(db, true, 1, 'outgoing', 'user@other.com');
    expect(result).toBeNull();
  });

  it('returns an ip_address_id when a rule matches', () => {
    const result = allocateIpAddress(db, true, 1, 'outgoing', 'user@example.com');
    expect(result).not.toBeNull();
    expect([1, 2]).toContain(result as number);
  });

  it('returns null when server does not exist', () => {
    const result = allocateIpAddress(db, true, 999, 'outgoing', 'user@example.com');
    expect(result).toBeNull();
  });
});

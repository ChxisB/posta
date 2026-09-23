import { describe, it, expect, beforeAll } from 'bun:test';
import { useTestDatabase } from './test-db';
import { authHeader } from './test-auth';
import { app, getDb } from '../index';

const ADMIN_UID = 'test_admin_for_ips';
const NON_ADMIN_UID = 'test_nonadmin_for_ips';

const AUTH_HEADER = authHeader(ADMIN_UID);
const NON_ADMIN_HEADER = authHeader(NON_ADMIN_UID);

describe('IP Addresses — nested under /ip_pools/:poolId/ip_addresses', () => {
  let poolId: number;

  beforeAll(async () => {
    await useTestDatabase('ip_addresses');

    const db = await getDb();

    // Ensure admin user exists
    await db.run(
      `INSERT INTO users (uuid, first_name, last_name, email_address, admin, oidc_uid, oidc_issuer, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 1, $5, 'clerk', NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [crypto.randomUUID().replace(/-/g, ''), 'Admin', 'User', 'admin@test.local', ADMIN_UID],
    );

    // Ensure non-admin user exists
    await db.run(
      `INSERT INTO users (uuid, first_name, last_name, email_address, admin, oidc_uid, oidc_issuer, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 0, $5, 'clerk', NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [crypto.randomUUID().replace(/-/g, ''), 'Non', 'Admin', 'nobody@test.local', NON_ADMIN_UID],
    );

    // Create a test pool
    const result = await db.run(
      `INSERT INTO ip_pools (uuid, name, default_pool, created_at, updated_at)
       VALUES ($1, $2, 0, NOW(), NOW())
       RETURNING id`,
      [crypto.randomUUID().replace(/-/g, ''), `test-pool-${Date.now()}`],
    );
    poolId = Number(result.lastInsertRowid);
  });

  // ── Auth protection ────────────────────────────────────────────

  it('rejects unauthenticated requests', async () => {
    const res = await app.handle(
      new Request(`http://localhost/ip_pools/${poolId}/ip_addresses`, { method: 'GET' }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects non-admin users with 403', async () => {
    const res = await app.handle(
      new Request(`http://localhost/ip_pools/${poolId}/ip_addresses`, {
        method: 'GET',
        headers: NON_ADMIN_HEADER,
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toBe('AdminRequired');
  });

  // ── CRUD ───────────────────────────────────────────────────────

  let addressId: number;

  it('creates an IP address', async () => {
    const res = await app.handle(
      new Request(`http://localhost/ip_pools/${poolId}/ip_addresses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
        body: JSON.stringify({ ipv4: '192.168.1.1', hostname: 'mail1.example.com', priority: 10 }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.ip_address).toBeDefined();
    expect(body.ip_address.ipv4).toBe('192.168.1.1');
    expect(body.ip_address.hostname).toBe('mail1.example.com');
    expect(body.ip_address.priority).toBe(10);
    expect(body.ip_address.ip_pool_id).toBe(poolId);
    expect(typeof body.ip_address.id).toBe('number');
    addressId = body.ip_address.id;
  });

  it('lists IP addresses in the pool', async () => {
    // Create another address so we can verify listing returns multiple
    await app.handle(
      new Request(`http://localhost/ip_pools/${poolId}/ip_addresses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
        body: JSON.stringify({ ipv4: '192.168.1.2', hostname: 'mail2.example.com', priority: 5 }),
      }),
    );

    const res = await app.handle(
      new Request(`http://localhost/ip_pools/${poolId}/ip_addresses`, {
        method: 'GET',
        headers: AUTH_HEADER,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ip_addresses).toBeArray();
    expect(body.ip_addresses.length).toBeGreaterThanOrEqual(2);

    // Verify our first address is in the list
    const found = body.ip_addresses.find((a: any) => a.id === addressId);
    expect(found).toBeDefined();
    expect(found.ipv4).toBe('192.168.1.1');
  });

  it('updates an IP address', async () => {
    const res = await app.handle(
      new Request(`http://localhost/ip_pools/${poolId}/ip_addresses/${addressId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
        body: JSON.stringify({ ipv4: '10.0.0.1', priority: 20 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ip_address).toBeDefined();
    expect(body.ip_address.ipv4).toBe('10.0.0.1');
    expect(body.ip_address.priority).toBe(20);
    // hostname should be unchanged (not in the patch body)
  });

  it('verifies the update persisted', async () => {
    const res = await app.handle(
      new Request(`http://localhost/ip_pools/${poolId}/ip_addresses`, {
        method: 'GET',
        headers: AUTH_HEADER,
      }),
    );
    const body = await res.json() as any;
    const addr = body.ip_addresses.find((a: any) => a.id === addressId);
    expect(addr).toBeDefined();
    expect(addr.ipv4).toBe('10.0.0.1');
    expect(addr.priority).toBe(20);
  });

  it('deletes an IP address', async () => {
    const res = await app.handle(
      new Request(`http://localhost/ip_pools/${poolId}/ip_addresses/${addressId}`, {
        method: 'DELETE',
        headers: AUTH_HEADER,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.deleted).toBe(true);
  });

  it('verifies the deleted address is gone', async () => {
    const res = await app.handle(
      new Request(`http://localhost/ip_pools/${poolId}/ip_addresses`, {
        method: 'GET',
        headers: AUTH_HEADER,
      }),
    );
    const body = await res.json() as any;
    const found = body.ip_addresses.find((a: any) => a.id === addressId);
    expect(found).toBeUndefined();
  });
});

import { describe, it, expect, beforeAll } from 'bun:test';
import { Elysia } from 'elysia';
import { serverIpPoolRuleRoutes, orgIpPoolRuleRoutes } from '../routes/org/ip_pool_rules.routes';
import { getDb } from '../index';

const testApp = new Elysia()
  .use(serverIpPoolRuleRoutes)
  .use(orgIpPoolRuleRoutes);

describe('IP Pool Rules — server-scoped', () => {
  let serverRuleUuid: string;

  beforeAll(async () => {
    const testId = Date.now();
    process.env.POSTA_MAIN_DB_URL = `postgresql://postgres:postgres@localhost:5432/posta_test_ip_pool_rules_${testId}`;
    process.env.POSTA_MESSAGE_DB_URL = `postgresql://postgres:postgres@localhost:5432/posta_test_ip_pool_rules_${testId}`;
    process.env.POSTA_CONFIG_FILE_PATH = '/dev/null';

    // Seed a test organization so org-permalink lookups succeed.
    const db = await getDb();
    await db.run(
      `INSERT INTO organizations (uuid, name, permalink, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (permalink) DO NOTHING`,
      [
        crypto.randomUUID().replace(/-/g, ''),
        'Test Org',
        'test-org',
      ],
    );
  });

  it('creates a server-scoped rule and verifies owner_type', async () => {
    const res = await testApp.handle(
      new Request(
        'http://localhost/org/test-org/servers/42/ip_pool_rules',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip_pool_id: 1,
            from_text: '10.0.0.1',
            to_text: '10.0.0.10',
          }),
        },
      ),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.ip_pool_rule).toBeDefined();
    expect(body.ip_pool_rule.owner_type).toBe('Server');
    expect(body.ip_pool_rule.owner_id).toBe(42);
    expect(body.ip_pool_rule.uuid).toBeDefined();
    serverRuleUuid = body.ip_pool_rule.uuid;
  });

  it('lists server-scoped rules', async () => {
    const res = await testApp.handle(
      new Request(
        'http://localhost/org/test-org/servers/42/ip_pool_rules',
        { method: 'GET' },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ip_pool_rules).toBeArray();
    expect(body.ip_pool_rules.length).toBeGreaterThanOrEqual(1);
    const rule = body.ip_pool_rules.find((r: any) => r.uuid === serverRuleUuid);
    expect(rule).toBeDefined();
    expect(rule.owner_type).toBe('Server');
  });

  it('patches a server-scoped rule by UUID', async () => {
    const res = await testApp.handle(
      new Request(
        `http://localhost/org/test-org/servers/42/ip_pool_rules/${serverRuleUuid}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from_text: '192.168.0.1' }),
        },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ip_pool_rule.from_text).toBe('192.168.0.1');
    // unchanged fields should stay
    expect(body.ip_pool_rule.to_text).toBe('10.0.0.10');
  });

  it('deletes a server-scoped rule by UUID', async () => {
    const res = await testApp.handle(
      new Request(
        `http://localhost/org/test-org/servers/42/ip_pool_rules/${serverRuleUuid}`,
        { method: 'DELETE' },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.deleted).toBe(true);
  });
});

describe('IP Pool Rules — org-scoped', () => {
  let orgRuleUuid: string;

  it('creates an org-scoped rule and verifies owner_type', async () => {
    const res = await testApp.handle(
      new Request(
        'http://localhost/org/test-org/ip_pool_rules',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip_pool_id: 2,
            from_text: '172.16.0.1',
          }),
        },
      ),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.ip_pool_rule).toBeDefined();
    expect(body.ip_pool_rule.owner_type).toBe('Organization');
    expect(body.ip_pool_rule.owner_id).toBeGreaterThan(0);
    expect(body.ip_pool_rule.uuid).toBeDefined();
    orgRuleUuid = body.ip_pool_rule.uuid;
  });

  it('lists org-scoped rules', async () => {
    const res = await testApp.handle(
      new Request(
        'http://localhost/org/test-org/ip_pool_rules',
        { method: 'GET' },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ip_pool_rules).toBeArray();
    const rule = body.ip_pool_rules.find((r: any) => r.uuid === orgRuleUuid);
    expect(rule).toBeDefined();
    expect(rule.owner_type).toBe('Organization');
  });

  it('patches an org-scoped rule by UUID', async () => {
    const res = await testApp.handle(
      new Request(
        `http://localhost/org/test-org/ip_pool_rules/${orgRuleUuid}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to_text: '172.16.0.255' }),
        },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ip_pool_rule.to_text).toBe('172.16.0.255');
  });

  it('deletes an org-scoped rule by UUID', async () => {
    const res = await testApp.handle(
      new Request(
        `http://localhost/org/test-org/ip_pool_rules/${orgRuleUuid}`,
        { method: 'DELETE' },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.deleted).toBe(true);
  });
});

describe('IP Pool Rules — cross-scope isolation', () => {
  it('server scoped list does not leak org-scoped rules', async () => {
    // Create an org-scoped rule
    const createRes = await testApp.handle(
      new Request(
        'http://localhost/org/test-org/ip_pool_rules',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip_pool_id: 3, from_text: '10.0.1.1' }),
        },
      ),
    );
    const created = (await createRes.json()) as any;
    expect(created.ip_pool_rule.owner_type).toBe('Organization');

    // List server-scoped rules — should NOT include the org rule
    const listRes = await testApp.handle(
      new Request(
        'http://localhost/org/test-org/servers/99/ip_pool_rules',
        { method: 'GET' },
      ),
    );
    const listBody = (await listRes.json()) as any;
    const found = listBody.ip_pool_rules.find(
      (r: any) => r.uuid === created.ip_pool_rule.uuid,
    );
    expect(found).toBeUndefined();
  });
});

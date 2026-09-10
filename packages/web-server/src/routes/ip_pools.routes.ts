import { Elysia, t } from 'elysia';

/**
 * IP Pool management routes.
 */
export const ipPoolRoutes = new Elysia({ prefix: '/ip_pools' })

  .get('/', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const pools = await db.query(`SELECT * FROM ip_pools`) as any[];
    c.set.status = 200;
    return { ip_pools: pools };
  }, { detail: { tags: ['IP Pools'], summary: 'List IP pools' } })

  .post('/', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const { name, default_pool } = c.body;
    const result = await db.run(
      `INSERT INTO ip_pools (name, default_pool, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING id`,
      [name, default_pool ?? false],
    );
    c.set.status = 201;
    return { ip_pool: { id: Number(result.lastInsertRowid), name, default_pool: default_pool ?? false } };
  }, {
    body: t.Object({ name: t.String(), default_pool: t.Optional(t.Boolean()) }),
    detail: { tags: ['IP Pools'], summary: 'Create an IP pool' },
  })

  .get('/:poolId', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const pool = await db.get(`SELECT * FROM ip_pools WHERE id = $1`, [c.params.poolId]) as any;
    if (!pool) { c.set.status = 404; return { error: 'PoolNotFound' }; }
    c.set.status = 200;
    return { ip_pool: pool };
  }, { detail: { tags: ['IP Pools'], summary: 'Get IP pool details' } })

  .patch('/:poolId', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const fields = Object.entries(c.body as Record<string, any>).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) { c.set.status = 200; return { ip_pool: {} }; }
    const values: any[] = fields.map(([_, v]) => v);
    values.push(c.params.poolId);
    const setClauses = fields.map(([k], i) => `${k} = $${i + 1}`);
    await db.run(`UPDATE ip_pools SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    c.set.status = 200;
    return { ip_pool: { id: parseInt(c.params.poolId), ...c.body } };
  }, {
    body: t.Object({ name: t.Optional(t.String()), default_pool: t.Optional(t.Boolean()) }),
    detail: { tags: ['IP Pools'], summary: 'Update an IP pool' },
  })

  .delete('/:poolId', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    await db.run(`DELETE FROM ip_pools WHERE id = $1`, [c.params.poolId]);
    c.set.status = 200;
    return { deleted: true };
  }, { detail: { tags: ['IP Pools'], summary: 'Delete an IP pool' } })

  // ── IP Addresses (nested under ip_pools) ──────────────────────

  .get('/:poolId/ip_addresses', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    if (!c.clerk?.authenticated) { c.set.status = 401; return { error: 'Unauthorized' }; }
    const currentUser = await db.get(`SELECT admin FROM users WHERE oidc_uid = $1`, [c.clerk.userId]) as any;
    if (!currentUser || !currentUser.admin) { c.set.status = 403; return { error: 'AdminRequired' }; }
    const addresses = await db.query(`SELECT * FROM ip_addresses WHERE ip_pool_id = $1 ORDER BY priority`, [c.params.poolId]) as any[];
    c.set.status = 200;
    return { ip_addresses: addresses };
  }, { detail: { tags: ['IP Addresses'], summary: 'List IP addresses in pool' } })

  .post('/:poolId/ip_addresses', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    if (!c.clerk?.authenticated) { c.set.status = 401; return { error: 'Unauthorized' }; }
    const currentUser = await db.get(`SELECT admin FROM users WHERE oidc_uid = $1`, [c.clerk.userId]) as any;
    if (!currentUser || !currentUser.admin) { c.set.status = 403; return { error: 'AdminRequired' }; }
    const pool = await db.get(`SELECT id FROM ip_pools WHERE id = $1`, [c.params.poolId]) as any;
    if (!pool) { c.set.status = 404; return { error: 'PoolNotFound' }; }
    const { ipv4, ipv6, hostname, priority } = c.body;
    const result = await db.run(
      `INSERT INTO ip_addresses (ip_pool_id, ipv4, ipv6, hostname, priority, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING id`,
      [c.params.poolId, ipv4 ?? null, ipv6 ?? null, hostname ?? null, priority ?? null],
    );
    c.set.status = 201;
    return { ip_address: { id: Number(result.lastInsertRowid), ip_pool_id: parseInt(c.params.poolId), ipv4: ipv4 ?? null, ipv6: ipv6 ?? null, hostname: hostname ?? null, priority: priority ?? null } };
  }, {
    body: t.Object({ ipv4: t.Optional(t.String()), ipv6: t.Optional(t.String()), hostname: t.Optional(t.String()), priority: t.Optional(t.Number()) }),
    detail: { tags: ['IP Addresses'], summary: 'Create an IP address' },
  })

  .patch('/:poolId/ip_addresses/:addressId', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    if (!c.clerk?.authenticated) { c.set.status = 401; return { error: 'Unauthorized' }; }
    const currentUser = await db.get(`SELECT admin FROM users WHERE oidc_uid = $1`, [c.clerk.userId]) as any;
    if (!currentUser || !currentUser.admin) { c.set.status = 403; return { error: 'AdminRequired' }; }
    const fields = Object.entries(c.body as Record<string, any>).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) { c.set.status = 200; return { ip_address: { id: parseInt(c.params.addressId) } }; }
    const values: any[] = fields.map(([_, v]) => v);
    values.push(c.params.addressId);
    const setClauses = fields.map(([k], i) => `${k} = $${i + 1}`);
    await db.run(`UPDATE ip_addresses SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    c.set.status = 200;
    return { ip_address: { id: parseInt(c.params.addressId), ...c.body } };
  }, {
    body: t.Object({ ipv4: t.Optional(t.String()), ipv6: t.Optional(t.String()), hostname: t.Optional(t.String()), priority: t.Optional(t.Number()) }),
    detail: { tags: ['IP Addresses'], summary: 'Update an IP address' },
  })

  .delete('/:poolId/ip_addresses/:addressId', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    if (!c.clerk?.authenticated) { c.set.status = 401; return { error: 'Unauthorized' }; }
    const currentUser = await db.get(`SELECT admin FROM users WHERE oidc_uid = $1`, [c.clerk.userId]) as any;
    if (!currentUser || !currentUser.admin) { c.set.status = 403; return { error: 'AdminRequired' }; }
    await db.run(`DELETE FROM ip_addresses WHERE id = $1`, [c.params.addressId]);
    c.set.status = 200;
    return { deleted: true };
  }, { detail: { tags: ['IP Addresses'], summary: 'Delete an IP address' } });

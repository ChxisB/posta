import { Elysia, t } from 'elysia';

/**
 * Organization CRUD routes.
 */
export const organizationRoutes = new Elysia({ prefix: '/organizations' })

  .get('/', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const organizations = await db.query(`SELECT * FROM organizations WHERE deleted_at IS NULL`) as any[];
    c.set.status = 200;
    return { organizations };
  }, { detail: { tags: ['Organizations'], summary: 'List organizations' } })

  .get('/stats', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const rows = await db.query(`
      SELECT
        o.id,
        o.permalink,
        o.name,
        COALESCE(s.server_count, 0) AS server_count,
        COALESCE(s.live_count, 0) AS live_count,
        COALESCE(d.domain_count, 0) AS domain_count,
        COALESCE(d.verified_count, 0) AS verified_count,
        COALESCE(c.credential_count, 0) AS credential_count,
        COALESCE(r.route_count, 0) AS route_count
      FROM organizations o
      LEFT JOIN (
        SELECT organization_id,
               COUNT(*) AS server_count,
               SUM(CASE WHEN mode = 'Live' THEN 1 ELSE 0 END) AS live_count
        FROM servers WHERE deleted_at IS NULL
        GROUP BY organization_id
      ) s ON s.organization_id = o.id
      LEFT JOIN (
        SELECT server_id,
               COUNT(*) AS domain_count,
               SUM(CASE WHEN verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified_count
        FROM domains
        GROUP BY server_id
      ) d ON d.server_id IN (SELECT id FROM servers WHERE organization_id = o.id AND deleted_at IS NULL)
      LEFT JOIN (
        SELECT server_id, COUNT(*) AS credential_count
        FROM credentials
        GROUP BY server_id
      ) c ON c.server_id IN (SELECT id FROM servers WHERE organization_id = o.id AND deleted_at IS NULL)
      LEFT JOIN (
        SELECT server_id, COUNT(*) AS route_count
        FROM routes
        GROUP BY server_id
      ) r ON r.server_id IN (SELECT id FROM servers WHERE organization_id = o.id AND deleted_at IS NULL)
      WHERE o.deleted_at IS NULL
      GROUP BY o.id
      ORDER BY o.name
    `) as any[];
    c.set.status = 200;
    return { organizations: rows };
  }, { detail: { tags: ['Organizations'], summary: 'Get per-org aggregate stats' } })

  .post('/', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const { name, permalink } = c.body;
    const uuid = crypto.randomUUID().replace(/-/g, '');
    const result = await db.run(`
      INSERT INTO organizations (name, permalink, uuid, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING id
    `, [name, permalink, uuid]);
    c.set.status = 201;
    return { organization: { id: Number(result.lastInsertRowid), uuid, name, permalink } };
  }, {
    body: t.Object({ name: t.String(), permalink: t.String() }),
    detail: { tags: ['Organizations'], summary: 'Create an organization' },
  })

  .get('/:orgId', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const org = await db.get(`SELECT * FROM organizations WHERE id = $1 OR permalink = $2`, [c.params.orgId, c.params.orgId]) as any;
    if (!org) { c.set.status = 404; return { error: 'OrgNotFound' }; }
    c.set.status = 200;
    return { organization: org };
  }, { detail: { tags: ['Organizations'], summary: 'Get organization details' } })

  .patch('/:orgId', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const fields = Object.entries(c.body as Record<string, any>).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) { c.set.status = 200; return { organization: {} }; }
    const values: any[] = fields.map(([_, v]) => v);
    values.push(c.params.orgId);
    const setClauses = fields.map(([k], i) => `${k} = $${i + 1}`);
    await db.run(`UPDATE organizations SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    c.set.status = 200;
    return { organization: { id: parseInt(c.params.orgId), ...c.body } };
  }, {
    body: t.Object({ name: t.Optional(t.String()), permalink: t.Optional(t.String()) }),
    detail: { tags: ['Organizations'], summary: 'Update an organization' },
  })

  .delete('/:orgId', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    await db.run(`UPDATE organizations SET deleted_at = NOW() WHERE id = $1`, [c.params.orgId]);
    c.set.status = 200;
    return { deleted: true };
  }, { detail: { tags: ['Organizations'], summary: 'Delete an organization' } });

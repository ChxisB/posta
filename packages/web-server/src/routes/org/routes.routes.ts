import { Elysia, t } from 'elysia';

/**
 * Route management routes.
 */
export const routeRoutes = new Elysia({ prefix: '/org/:orgPermalink/servers/:serverId/routes' })

  .get('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const routes = await db.query(`SELECT * FROM routes WHERE server_id = $1`, [c.params.serverId]) as any[];
    c.set.status = 200;
    return { routes };
  }, { detail: { tags: ['Routes'], summary: 'List routes' } })

  .post('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const { name, domain_id, mode, spam_mode, endpoint_type, endpoint_id } = c.body;
    const result = await db.run(`
      INSERT INTO routes (server_id, name, domain_id, mode, spam_mode, endpoint_type, endpoint_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING id
    `, [c.params.serverId, name, domain_id ?? null, mode ?? 'Normal', spam_mode ?? null, endpoint_type ?? null, endpoint_id ?? null]);
    c.set.status = 201;
    return { route: { id: Number(result.lastInsertRowid), name } };
  }, {
    body: t.Object({
      name: t.String(),
      domain_id: t.Optional(t.Number()),
      mode: t.Optional(t.String()),
      spam_mode: t.Optional(t.String()),
      endpoint_type: t.Optional(t.String()),
      endpoint_id: t.Optional(t.Number()),
    }),
    detail: { tags: ['Routes'], summary: 'Create a route' },
  })

  .get('/:routeId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const route = await db.get(
      `SELECT r.*, d.name as domain_name FROM routes r LEFT JOIN domains d ON d.id = r.domain_id WHERE r.id = $1`,
      [c.params.routeId],
    ) as any;
    if (!route) { c.set.status = 404; return { error: 'RouteNotFound' }; }
    return { route };
  }, {
    params: t.Object({ routeId: t.String() }),
    detail: { tags: ['Routes'], summary: 'Get a route' },
  })

  .patch('/:routeId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const fields = Object.entries(c.body as Record<string, any>).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) { c.set.status = 200; return { route: { id: parseInt(c.params.routeId) } }; }
    const values: any[] = fields.map(([_, v]) => v);
    values.push(c.params.routeId);
    const setClauses = fields.map(([k], i) => `${k} = $${i + 1}`);
    await db.run(`UPDATE routes SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    c.set.status = 200;
    return { route: { id: parseInt(c.params.routeId), ...c.body } };
  }, {
    params: t.Object({ routeId: t.String() }),
    body: t.Object({
      name: t.Optional(t.String()),
      mode: t.Optional(t.String()),
      spam_mode: t.Optional(t.String()),
      endpoint_type: t.Optional(t.String()),
      endpoint_id: t.Optional(t.Number()),
    }),
    detail: { tags: ['Routes'], summary: 'Update a route' },
  })

  .delete('/:routeId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    await db.run(`DELETE FROM routes WHERE id = $1`, [c.params.routeId]);
    c.set.status = 200;
    return { deleted: true };
  }, {
    params: t.Object({ routeId: t.String() }),
    detail: { tags: ['Routes'], summary: 'Delete a route' },
  });

import { Elysia, t } from 'elysia';

/**
 * Endpoint management routes.
 */
export const endpointRoutes = new Elysia({ prefix: '/org/:orgPermalink/servers/:serverId/endpoints' })

  .get('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const http_endpoints = db.query(`SELECT * FROM http_endpoints WHERE server_id = ?`).all(c.params.serverId) as any[];
    const smtp_endpoints = db.query(`SELECT * FROM smtp_endpoints WHERE server_id = ?`).all(c.params.serverId) as any[];
    const address_endpoints = db.query(`SELECT * FROM address_endpoints WHERE server_id = ?`).all(c.params.serverId) as any[];
    c.set.status = 200;
    return { http_endpoints, smtp_endpoints, address_endpoints };
  }, { detail: { tags: ['Endpoints'], summary: 'List endpoints for a server' } })

  .post('/http', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const { name, url, format, strip_replies, encoding } = c.body;
    const stmt = db.prepare(`
      INSERT INTO http_endpoints (server_id, name, url, format, strip_replies, encoding, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    const result = stmt.run(c.params.serverId, name, url, format ?? 'JSON', strip_replies ?? false, encoding ?? 'Base64');
    c.set.status = 201;
    return { endpoint: { id: Number(result.lastInsertRowid), name, url, type: 'HTTP' } };
  }, {
    body: t.Object({
      name: t.String(), url: t.String(),
      format: t.Optional(t.String()), strip_replies: t.Optional(t.Boolean()), encoding: t.Optional(t.String()),
    }),
    detail: { tags: ['Endpoints'], summary: 'Create an HTTP endpoint' },
  })

  .post('/smtp', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const { name, hostname, port, ssl_mode } = c.body;
    const stmt = db.prepare(`
      INSERT INTO smtp_endpoints (server_id, name, hostname, port, ssl_mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    const result = stmt.run(c.params.serverId, name, hostname, port ?? 25, ssl_mode ?? 'Auto');
    c.set.status = 201;
    return { endpoint: { id: Number(result.lastInsertRowid), name, hostname, type: 'SMTP' } };
  }, {
    body: t.Object({
      name: t.String(), hostname: t.String(),
      port: t.Optional(t.Number()), ssl_mode: t.Optional(t.String()),
    }),
    detail: { tags: ['Endpoints'], summary: 'Create an SMTP endpoint' },
  })

  .post('/address', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const { name, email } = c.body;
    const stmt = db.prepare(`
      INSERT INTO address_endpoints (server_id, name, email, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `);
    const result = stmt.run(c.params.serverId, name, email);
    c.set.status = 201;
    return { endpoint: { id: Number(result.lastInsertRowid), name, email, type: 'Address' } };
  }, {
    body: t.Object({ name: t.String(), email: t.String() }),
    detail: { tags: ['Endpoints'], summary: 'Create an Address endpoint' },
  })

  .get('/http/:endpointId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const endpoint = db.query(`SELECT * FROM http_endpoints WHERE id = ? AND server_id = ?`).get(c.params.endpointId, c.params.serverId) as any;
    if (!endpoint) { c.set.status = 404; return { error: 'EndpointNotFound' }; }
    return { endpoint: { ...endpoint, type: 'HTTP' } };
  }, { detail: { tags: ['Endpoints'], summary: 'Get an HTTP endpoint' } })

  .patch('/http/:endpointId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const fields = Object.entries(c.body as Record<string, any>).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) { c.set.status = 200; return { endpoint: {} }; }
    const values: any[] = fields.map(([_, v]) => v);
    values.push(c.params.endpointId, c.params.serverId);
    db.prepare(`UPDATE http_endpoints SET ${fields.map(([k]) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ? AND server_id = ?`).run(...values);
    c.set.status = 200;
    return { endpoint: { id: parseInt(c.params.endpointId), ...c.body, type: 'HTTP' } };
  }, {
    params: t.Object({ endpointId: t.String() }),
    body: t.Object({
      name: t.Optional(t.String()), url: t.Optional(t.String()),
      format: t.Optional(t.String()), strip_replies: t.Optional(t.Boolean()),
      encoding: t.Optional(t.String()),
    }),
    detail: { tags: ['Endpoints'], summary: 'Update an HTTP endpoint' },
  })

  .get('/smtp/:endpointId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const endpoint = db.query(`SELECT * FROM smtp_endpoints WHERE id = ? AND server_id = ?`).get(c.params.endpointId, c.params.serverId) as any;
    if (!endpoint) { c.set.status = 404; return { error: 'EndpointNotFound' }; }
    return { endpoint: { ...endpoint, type: 'SMTP' } };
  }, { detail: { tags: ['Endpoints'], summary: 'Get an SMTP endpoint' } })

  .patch('/smtp/:endpointId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const fields = Object.entries(c.body as Record<string, any>).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) { c.set.status = 200; return { endpoint: {} }; }
    const values: any[] = fields.map(([_, v]) => v);
    values.push(c.params.endpointId, c.params.serverId);
    db.prepare(`UPDATE smtp_endpoints SET ${fields.map(([k]) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ? AND server_id = ?`).run(...values);
    c.set.status = 200;
    return { endpoint: { id: parseInt(c.params.endpointId), ...c.body, type: 'SMTP' } };
  }, {
    params: t.Object({ endpointId: t.String() }),
    body: t.Object({
      name: t.Optional(t.String()), hostname: t.Optional(t.String()),
      port: t.Optional(t.Number()), ssl_mode: t.Optional(t.String()),
    }),
    detail: { tags: ['Endpoints'], summary: 'Update an SMTP endpoint' },
  })

  .get('/address/:endpointId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const endpoint = db.query(`SELECT * FROM address_endpoints WHERE id = ? AND server_id = ?`).get(c.params.endpointId, c.params.serverId) as any;
    if (!endpoint) { c.set.status = 404; return { error: 'EndpointNotFound' }; }
    return { endpoint: { ...endpoint, type: 'Address' } };
  }, { detail: { tags: ['Endpoints'], summary: 'Get an Address endpoint' } })

  .patch('/address/:endpointId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const fields = Object.entries(c.body as Record<string, any>).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) { c.set.status = 200; return { endpoint: {} }; }
    const values: any[] = fields.map(([_, v]) => v);
    values.push(c.params.endpointId, c.params.serverId);
    db.prepare(`UPDATE address_endpoints SET ${fields.map(([k]) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ? AND server_id = ?`).run(...values);
    c.set.status = 200;
    return { endpoint: { id: parseInt(c.params.endpointId), ...c.body, type: 'Address' } };
  }, {
    params: t.Object({ endpointId: t.String() }),
    body: t.Object({
      name: t.Optional(t.String()), email: t.Optional(t.String()),
    }),
    detail: { tags: ['Endpoints'], summary: 'Update an Address endpoint' },
  })

  .delete('/:endpointType/:endpointId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const table = c.params.endpointType === 'http' ? 'http_endpoints' : c.params.endpointType === 'smtp' ? 'smtp_endpoints' : 'address_endpoints';
    db.run(`DELETE FROM ${table} WHERE id = ?`, [c.params.endpointId]);
    c.set.status = 200;
    return { deleted: true };
  }, { detail: { tags: ['Endpoints'], summary: 'Delete an endpoint' } });

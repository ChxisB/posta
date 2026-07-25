import { Elysia, t } from 'elysia';

/**
 * Webhook management routes.
 */
export const webhookRoutes = new Elysia({ prefix: '/org/:orgPermalink/servers/:serverId/webhooks' })

  .get('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const webhooks = db.query(`SELECT * FROM webhooks WHERE server_id = ?`).all(c.params.serverId) as any[];
    c.set.status = 200;
    return { webhooks };
  }, { detail: { tags: ['Webhooks'], summary: 'List webhooks' } })

  .post('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const { name, url, enabled, all_events, events } = c.body;
    const uuid = crypto.randomUUID().replace(/-/g, '');
    const stmt = db.prepare(`
      INSERT INTO webhooks (server_id, uuid, name, url, enabled, all_events, events, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    const result = stmt.run(c.params.serverId, uuid, name, url, enabled ?? true, all_events ?? true, events ?? null);
    c.set.status = 201;
    return { webhook: { id: Number(result.lastInsertRowid), uuid, name, url } };
  }, {
    body: t.Object({
      name: t.String(), url: t.String(),
      enabled: t.Optional(t.Boolean()), all_events: t.Optional(t.Boolean()),
      events: t.Optional(t.Array(t.String())),
    }),
    detail: { tags: ['Webhooks'], summary: 'Create a webhook' },
  })

  .get('/:webhookId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const webhook = db.query(`SELECT * FROM webhooks WHERE id = ?`).get(c.params.webhookId) as any;
    if (!webhook) { c.set.status = 404; return { error: 'WebhookNotFound' }; }
    c.set.status = 200;
    return { webhook };
  }, { detail: { tags: ['Webhooks'], summary: 'Get a webhook' } })

  .patch('/:webhookId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const fields = Object.entries(c.body as Record<string, any>).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) { c.set.status = 200; return { webhook: {} }; }
    const values: any[] = fields.map(([_, v]) => v);
    values.push(c.params.webhookId);
    db.prepare(`UPDATE webhooks SET ${fields.map(([k]) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values);
    c.set.status = 200;
    return { webhook: { id: parseInt(c.params.webhookId), ...c.body } };
  }, {
    params: t.Object({ webhookId: t.String() }),
    body: t.Object({
      name: t.Optional(t.String()), url: t.Optional(t.String()),
      enabled: t.Optional(t.Boolean()), all_events: t.Optional(t.Boolean()),
    }),
    detail: { tags: ['Webhooks'], summary: 'Update a webhook' },
  })

  .delete('/:webhookId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    db.run(`DELETE FROM webhooks WHERE id = ?`, [c.params.webhookId]);
    c.set.status = 200;
    return { deleted: true };
  }, { detail: { tags: ['Webhooks'], summary: 'Delete a webhook' } })

  .get('/:webhookId/history', async (c: any) => {
    const { getProvisioner } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const { WebhookStore } = await import('@posta/message-db');
    const result = new WebhookStore(msgDb).list(1);
    c.set.status = 200;
    return { requests: result.records ?? [] };
  }, { detail: { tags: ['Webhooks'], summary: 'Get webhook delivery history' } })

  .get('/:webhookId/history/:uuid', async (c: any) => {
    const { getProvisioner } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const { WebhookStore, WebhookNotFoundError } = await import('@posta/message-db');
    try {
      const request = new WebhookStore(msgDb).find(c.params.uuid);
      c.set.status = 200;
      return { request };
    } catch (err) {
      if (err instanceof WebhookNotFoundError) {
        c.set.status = 404;
        return { error: 'WebhookRequestNotFound' };
      }
      throw err;
    }
  }, {
    params: t.Object({ webhookId: t.String(), uuid: t.String() }),
    detail: { tags: ['Webhooks'], summary: 'Get a single webhook request by UUID' },
  });

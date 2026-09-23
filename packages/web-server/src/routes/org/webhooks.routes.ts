import { Elysia, t } from 'elysia';

/**
 * Webhook management routes.
 */
export const webhookRoutes = new Elysia({ prefix: '/org/:orgPermalink/servers/:serverId/webhooks' })

  .get('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const webhooks = await db.query(`SELECT * FROM webhooks WHERE server_id = $1`, [c.params.serverId]) as any[];
    c.set.status = 200;
    return { webhooks };
  }, { detail: { tags: ['Webhooks'], summary: 'List webhooks' } })

  .post('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const { name, url, enabled, all_events, events } = c.body;
    const uuid = crypto.randomUUID().replace(/-/g, '');
    const result = await db.run(`
      INSERT INTO webhooks (server_id, uuid, name, url, enabled, all_events, events, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING id
    `, [c.params.serverId, uuid, name, url, enabled ?? true, all_events ?? true, events ?? null]);
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
    const db = await getDb();
    const webhook = await db.get(`SELECT * FROM webhooks WHERE id = $1`, [c.params.webhookId]) as any;
    if (!webhook) { c.set.status = 404; return { error: 'WebhookNotFound' }; }
    c.set.status = 200;
    return { webhook };
  }, { detail: { tags: ['Webhooks'], summary: 'Get a webhook' } })

  .patch('/:webhookId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const fields = Object.entries(c.body as Record<string, any>).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) { c.set.status = 200; return { webhook: {} }; }
    const values: any[] = fields.map(([_, v]) => v);
    values.push(c.params.webhookId);
    const setClauses = fields.map(([k], i) => `${k} = $${i + 1}`);
    await db.run(`UPDATE webhooks SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    c.set.status = 200;
    return { webhook: { id: parseInt(c.params.webhookId), ...c.body } };
  }, {
    params: t.Object({ orgPermalink: t.String(), serverId: t.String(), webhookId: t.String() }),
    body: t.Object({
      name: t.Optional(t.String()), url: t.Optional(t.String()),
      enabled: t.Optional(t.Boolean()), all_events: t.Optional(t.Boolean()),
    }),
    detail: { tags: ['Webhooks'], summary: 'Update a webhook' },
  })

  .delete('/:webhookId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    await db.run(`DELETE FROM webhooks WHERE id = $1`, [c.params.webhookId]);
    c.set.status = 200;
    return { deleted: true };
  }, { detail: { tags: ['Webhooks'], summary: 'Delete a webhook' } })

  .get('/:webhookId/history', async (c: any) => {
    const { getProvisioner, getConfig } = await import('../../index');
    const { getServerDb } = await import('@posta/core');
    const config = await getConfig();
    const provisioner = await getProvisioner();
    const serverId = parseInt(c.params.serverId);
    const client = getServerDb(config, serverId);
    const msgDb = await provisioner.openServerDb(serverId, client);
    const { WebhookStore } = await import('@posta/message-db');
    const result = await new WebhookStore(msgDb).list(1);
    c.set.status = 200;
    return { requests: result.records ?? [] };
  }, { detail: { tags: ['Webhooks'], summary: 'Get webhook delivery history' } })

  .get('/:webhookId/history/:uuid', async (c: any) => {
    const { getProvisioner, getConfig } = await import('../../index');
    const { getServerDb } = await import('@posta/core');
    const config = await getConfig();
    const provisioner = await getProvisioner();
    const serverId = parseInt(c.params.serverId);
    const client = getServerDb(config, serverId);
    const msgDb = await provisioner.openServerDb(serverId, client);
    const { WebhookStore, WebhookNotFoundError } = await import('@posta/message-db');
    try {
      const request = await new WebhookStore(msgDb).find(c.params.uuid);
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
    params: t.Object({ orgPermalink: t.String(), serverId: t.String(), webhookId: t.String(), uuid: t.String() }),
    detail: { tags: ['Webhooks'], summary: 'Get a single webhook request by UUID' },
  });

import { Elysia, t } from 'elysia';

/**
 * Server management routes under /org/:orgPermalink/servers
 */
export const serverRoutes = new Elysia({ prefix: '/org/:orgPermalink/servers' })

  .get('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const servers = await db.query(
      `SELECT * FROM servers WHERE organization_id = (SELECT id FROM organizations WHERE permalink = $1) AND deleted_at IS NULL`,
      [c.params.orgPermalink],
    ) as any[];
    c.set.status = 200;
    return { servers };
  }, {
    detail: { tags: ['Servers'], summary: 'List servers in an organization' },
  })

  .post('/', async (c: any) => {
    const { name, mode, ip_pool_id } = c.body;
    const { getDb } = await import('../../index');
    const db = await getDb();

    const org = await db.get(`SELECT id FROM organizations WHERE permalink = $1`, [c.params.orgPermalink]) as any;
    if (!org) { c.set.status = 404; return { error: 'OrgNotFound' }; }

    const uuid = crypto.randomUUID().replace(/-/g, '');
    const result = await db.run(`
      INSERT INTO servers (organization_id, uuid, name, mode, ip_pool_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id
    `, [org.id, uuid, name, mode ?? 'Live', ip_pool_id ?? null]);
    c.set.status = 201;
    return { server: { id: Number(result.lastInsertRowid), uuid, name, mode: mode ?? 'Live', ip_pool_id: ip_pool_id ?? null } };
  }, {
    body: t.Object({
      name: t.String(),
      mode: t.Optional(t.String()),
      ip_pool_id: t.Optional(t.Number()),
    }),
    detail: { tags: ['Servers'], summary: 'Create a new server' },
  })

  .get('/:serverId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const server = await db.get(
      `SELECT * FROM servers WHERE id = $1 AND organization_id = (SELECT id FROM organizations WHERE permalink = $2) AND deleted_at IS NULL`,
      [c.params.serverId, c.params.orgPermalink],
    ) as any;
    if (!server) { c.set.status = 404; return { error: 'ServerNotFound' }; }
    c.set.status = 200;
    return { server };
  }, {
    params: t.Object({ serverId: t.String(), orgPermalink: t.String() }),
    detail: { tags: ['Servers'], summary: 'Get server details' },
  })

  .patch('/:serverId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const fields = Object.entries(c.body as Record<string, any>).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) { c.set.status = 200; return { server: { id: parseInt(c.params.serverId) } }; }
    const setClauses = fields.map(([k], i) => `${k} = $${i + 1}`);
    const values: any[] = fields.map(([_, v]) => v);
    values.push(c.params.serverId);
    await db.run(`UPDATE servers SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    c.set.status = 200;
    return { server: { id: parseInt(c.params.serverId), ...c.body } };
  }, {
    params: t.Object({ serverId: t.String(), orgPermalink: t.String() }),
    body: t.Object({
      name: t.Optional(t.String()),
      mode: t.Optional(t.String()),
      spam_threshold: t.Optional(t.Number()),
      spam_failure_threshold: t.Optional(t.Number()),
      postmaster_address: t.Optional(t.String()),
      send_limit: t.Optional(t.Number()),
      allow_sender: t.Optional(t.Boolean()),
      privacy_mode: t.Optional(t.Boolean()),
      log_smtp_data: t.Optional(t.Boolean()),
      outbound_spam_threshold: t.Optional(t.Number()),
      message_retention_days: t.Optional(t.Number()),
      raw_message_retention_days: t.Optional(t.Number()),
      raw_message_retention_size: t.Optional(t.Number()),
    }),
    detail: { tags: ['Servers'], summary: 'Update server settings' },
  })

  .delete('/:serverId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    if (!c.body.confirm_text) {
      c.set.status = 400;
      return { error: 'ConfirmationRequired', message: 'confirm_text is required to delete a server' };
    }
    await db.run(`UPDATE servers SET deleted_at = NOW() WHERE id = $1`, [c.params.serverId]);
    c.set.status = 200;
    return { deleted: true };
  }, {
    params: t.Object({ serverId: t.String(), orgPermalink: t.String() }),
    body: t.Object({ confirm_text: t.String() }),
    detail: { tags: ['Servers'], summary: 'Delete a server' },
  })

  .post('/:serverId/suspend', async (c: any) => {
    const { getDb, getConfig } = await import('../../index');
    const db = await getDb();
    const config = await getConfig();
    const server = await db.get(`SELECT name FROM servers WHERE id = $1`, [c.params.serverId]) as any;
    await db.run(`UPDATE servers SET suspended_at = NOW(), suspension_reason = $1 WHERE id = $2`, [c.body.reason ?? null, c.params.serverId]);
    if (server) {
      const { sendServerSuspendedEmail } = await import('@posta/message-db');
      try {
        await sendServerSuspendedEmail(config, parseInt(c.params.serverId), server.name, c.body.reason ?? 'No reason provided');
      } catch (err: any) {
        console.error(`[web] failed to send suspension notification for server ${c.params.serverId}:`, err.message);
      }
    }
    c.set.status = 200;
    return { suspended: true };
  }, {
    params: t.Object({ serverId: t.String(), orgPermalink: t.String() }),
    body: t.Object({ reason: t.Optional(t.String()) }),
    detail: { tags: ['Servers'], summary: 'Suspend a server' },
  })

  .post('/:serverId/unsuspend', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    await db.run(`UPDATE servers SET suspended_at = NULL, suspension_reason = NULL WHERE id = $1`, [c.params.serverId]);
    c.set.status = 200;
    return { unsuspended: true };
  }, {
    params: t.Object({ serverId: t.String(), orgPermalink: t.String() }),
    detail: { tags: ['Servers'], summary: 'Unsuspend a server' },
  })

  .get('/:serverId/queue', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const page = parseInt(c.query.page ?? '1');
    const limit = 20;
    const offset = (page - 1) * limit;
    const messages = await db.query(
      `SELECT q.* FROM queued_messages q
       WHERE q.server_id = $1 ORDER BY q.created_at DESC LIMIT $2 OFFSET $3`,
      [c.params.serverId, limit, offset],
    ) as any[];
    c.set.status = 200;
    return { messages, page };
  }, {
    params: t.Object({ serverId: t.String(), orgPermalink: t.String() }),
    query: t.Object({ page: t.Optional(t.String()) }),
    detail: { tags: ['Servers'], summary: 'Get queued messages for a server' },
  })

  .get('/:serverId/limits', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const server = await db.get(
      `SELECT send_limit, send_limit_approaching_at, send_limit_exceeded_at FROM servers WHERE id = $1`,
      [c.params.serverId],
    ) as any;
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const todayTs = today.getTime() / 1000;
    const count = await db.get(
      `SELECT COUNT(*) as c FROM queued_messages WHERE server_id = $1 AND created_at >= $2`,
      [c.params.serverId, today.toISOString()],
    ) as any;
    const sentToday = count?.c ?? 0;
    c.set.status = 200;
    return {
      send_limit: server?.send_limit ?? 1000,
      sent_today: sentToday,
      approaching: (server?.send_limit ? sentToday >= server.send_limit * 0.9 : false),
      exceeded: (server?.send_limit ? sentToday >= server.send_limit : false),
    };
  }, {
    params: t.Object({ serverId: t.String(), orgPermalink: t.String() }),
    detail: { tags: ['Servers'], summary: 'Get server send limits' },
  })

  .get('/:serverId/spam', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const server = await db.get(
      `SELECT spam_threshold, spam_failure_threshold, outbound_spam_threshold FROM servers WHERE id = $1`,
      [c.params.serverId],
    ) as any;
    c.set.status = 200;
    return {
      spam_threshold: server?.spam_threshold ?? 5,
      spam_failure_threshold: server?.spam_failure_threshold ?? 20,
      outbound_spam_threshold: server?.outbound_spam_threshold ?? 5,
    };
  }, {
    params: t.Object({ serverId: t.String(), orgPermalink: t.String() }),
    detail: { tags: ['Servers'], summary: 'Get server spam settings' },
  })

  .get('/:serverId/retention', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const server = await db.get(
      `SELECT message_retention_days, raw_message_retention_days, raw_message_retention_size FROM servers WHERE id = $1`,
      [c.params.serverId],
    ) as any;
    c.set.status = 200;
    return {
      message_retention_days: server?.message_retention_days ?? 60,
      raw_message_retention_days: server?.raw_message_retention_days ?? 7,
      raw_message_retention_size: server?.raw_message_retention_size ?? 100,
    };
  }, {
    params: t.Object({ serverId: t.String(), orgPermalink: t.String() }),
    detail: { tags: ['Servers'], summary: 'Get server retention policy' },
  })

  .get('/:serverId/help/outgoing', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const all = await db.query(
      `SELECT key, type, name FROM credentials WHERE server_id = $1 AND (hold IS NULL OR hold = 0) ORDER BY type`,
      [c.params.serverId],
    ) as any[];
    const grouped: Record<string, any[]> = {};
    for (const cred of all) {
      const t = cred.type ?? 'Unknown';
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(cred);
    }
    c.set.status = 200;
    return { credentials: grouped };
  }, {
    detail: { tags: ['Servers'], summary: 'Get outgoing help info' },
  })

  .get('/:serverId/help/incoming', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const routes = await db.query(
      `SELECT r.id, r.name, r.mode, r.endpoint_type, r.domain_id, d.name as domain_name
       FROM routes r LEFT JOIN domains d ON d.id = r.domain_id
       WHERE r.server_id = $1 ORDER BY r.name`,
      [c.params.serverId],
    ) as any[];
    c.set.status = 200;
    return { routes };
  }, {
    detail: { tags: ['Servers'], summary: 'Get incoming help info' },
  })

  .get('/:serverId/advanced', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const server = await db.get(
      `SELECT log_smtp_data, privacy_mode, allow_sender, postmaster_address FROM servers WHERE id = $1`,
      [c.params.serverId],
    ) as any;
    c.set.status = 200;
    return {
      log_smtp_data: server?.log_smtp_data ?? false,
      privacy_mode: server?.privacy_mode ?? false,
      allow_sender: server?.allow_sender ?? false,
      postmaster_address: server?.postmaster_address ?? null,
    };
  }, {
    detail: { tags: ['Servers'], summary: 'Get advanced server settings' },
  });

/**
 * Credential routes under /org/:orgPermalink/servers/:serverId/credentials
 */
export const credentialRoutes = new Elysia({ prefix: '/org/:orgPermalink/servers/:serverId/credentials' })

  .get('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const credentials = await db.query(
      `SELECT * FROM credentials WHERE server_id = $1`,
      [c.params.serverId],
    ) as any[];
    c.set.status = 200;
    return { credentials };
  }, { detail: { tags: ['Credentials'], summary: 'List credentials for a server' } })

  .post('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const { type, name, key, hold } = c.body;
    const uuid = crypto.randomUUID().replace(/-/g, '');
    const keyToStore = key ?? crypto.randomUUID().replace(/-/g, '');
    const result = await db.run(`
      INSERT INTO credentials (server_id, uuid, type, name, key, hold, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING id
    `, [c.params.serverId, uuid, type, name, keyToStore, hold ?? false]);
    c.set.status = 201;
    return { credential: { id: Number(result.lastInsertRowid), uuid, type, name, key: keyToStore, hold: hold ?? false } };
  }, {
    body: t.Object({
      type: t.String(),
      name: t.String(),
      key: t.Optional(t.String()),
      hold: t.Optional(t.Boolean()),
    }),
    detail: { tags: ['Credentials'], summary: 'Create a credential' },
  })

  .get('/:credId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const credential = await db.get(
      `SELECT * FROM credentials WHERE id = $1 AND server_id = $2`,
      [c.params.credId, c.params.serverId],
    ) as any;
    if (!credential) { c.set.status = 404; return { error: 'CredentialNotFound' }; }
    return { credential };
  }, {
    params: t.Object({ credId: t.String(), serverId: t.String(), orgPermalink: t.String() }),
    detail: { tags: ['Credentials'], summary: 'Get a credential' },
  })

  .patch('/:credId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const fields = Object.entries(c.body as Record<string, any>).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) { c.set.status = 200; return { credential: {} }; }
    const setClauses = fields.map(([k], i) => `${k} = $${i + 1}`);
    const values = fields.map(([_, v]) => v);
    values.push(c.params.credId);
    await db.run(`UPDATE credentials SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    c.set.status = 200;
    return { credential: { id: parseInt(c.params.credId), ...c.body } };
  }, {
    params: t.Object({ credId: t.String(), serverId: t.String(), orgPermalink: t.String() }),
    body: t.Object({
      name: t.Optional(t.String()),
      key: t.Optional(t.String()),
      hold: t.Optional(t.Boolean()),
    }),
    detail: { tags: ['Credentials'], summary: 'Update a credential' },
  })

  .delete('/:credId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    await db.run(`DELETE FROM credentials WHERE id = $1`, [c.params.credId]);
    c.set.status = 200;
    return { deleted: true };
  }, {
    params: t.Object({ credId: t.String(), serverId: t.String(), orgPermalink: t.String() }),
    detail: { tags: ['Credentials'], summary: 'Delete a credential' },
  });

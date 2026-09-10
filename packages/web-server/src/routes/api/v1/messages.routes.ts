import { Elysia, t } from 'elysia';
import { requireApiAuth } from '../../../middleware/api-auth';

function renderSuccess(data: Record<string, any>, startedAt?: number): any {
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  return { status: 'success', time: elapsed, flags: {}, data };
}

function renderError(code: string, extra: Record<string, any> = {}, startedAt?: number): any {
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  return { status: 'error', time: elapsed, flags: {}, data: { code, ...extra } };
}

export const messagesRoutes = new Elysia({ prefix: '/api/v1/messages' })

  .use(requireApiAuth)

  .get('/message', async (c: any) => {
    const t0 = Date.now();
    try {
      const messageId = parseInt(c.query.id as string, 10);
      if (isNaN(messageId)) {
        return renderError('InvalidParameter', { message: '`id` query parameter must be a numeric message ID' }, t0);
      }

      const serverId = c.auth?.server?.id;
      if (!serverId) {
        return renderError('ServerRequired', { message: 'Could not determine server from API key.' }, t0);
      }

      const expand = c.query.expand as string | undefined;
      const expansions = parseExpansions(expand);

      const { getProvisioner, getConfig, MessageStore } = await import('../../../index');
      const { getServerDb } = await import('@posta/core');
      const config = await getConfig();
      const provisioner = await getProvisioner();
      const client = getServerDb(config, serverId);
      const msgDb = await provisioner.openServerDb(serverId, client);
      const msg = await msgDb.db.get(`SELECT * FROM messages WHERE id = $1`, [messageId]) as any;

      if (!msg) {
        return renderError('MessageNotFound', { message: `No message found with id ${messageId}` }, t0);
      }

      const message: Record<string, any> = { id: msg.id, token: msg.token };

      if (expansions === true || expansions.includes('status')) {
        message.status = {
          status: msg.status ?? null,
          last_delivery_attempt: msg.last_delivery_attempt ?? null,
          held: msg.held === 1 || msg.held === true,
          hold_expiry: msg.hold_expiry ?? null,
        };
      }

      if (expansions === true || expansions.includes('details')) {
        message.details = {
          rcpt_to: msg.rcpt_to,
          mail_from: msg.mail_from,
          subject: msg.subject,
          message_id: msg.message_id,
          timestamp: msg.timestamp,
          direction: msg.scope,
          size: msg.size,
          bounce: msg.bounce === 1 || msg.bounce === true,
          bounce_for_id: msg.bounce_for_id ?? null,
          tag: msg.tag ?? null,
          received_with_ssl: msg.received_with_ssl === 1 || msg.received_with_ssl === true,
        };
      }

      if (expansions === true || expansions.includes('headers')) {
        const store = new MessageStore(msgDb);
        let raw = '';
        try { raw = await store.getRawHeaders(msg); } catch { raw = ''; }
        const headers: Record<string, string[]> = {};
        for (const line of raw.split('\r\n')) {
          const idx = line.indexOf(':');
          if (idx > 0) {
            const key = line.slice(0, idx).toLowerCase();
            const val = line.slice(idx + 1).trim();
            if (!headers[key]) headers[key] = [];
            headers[key].push(val);
          }
        }
        message.headers = headers;
      }

      return renderSuccess({ message }, t0);
    } catch (err: any) {
      return renderError('InternalError', { message: err.message ?? 'An error occurred' }, t0);
    }
  }, {
    query: t.Object({
      id: t.Optional(t.String()),
      expand: t.Optional(t.String()),
    }),
    detail: { tags: ['Messages'], summary: 'Get message details (legacy alias using query params)' },
  })

  .get('/deliveries', async (c: any) => {
    const t0 = Date.now();
    try {
      const messageId = parseInt(c.query.id as string, 10);
      if (isNaN(messageId)) {
        return renderError('InvalidParameter', { message: '`id` query parameter must be a numeric message ID' }, t0);
      }

      const serverId = c.auth?.server?.id;
      if (!serverId) {
        return renderError('ServerRequired', { message: 'Could not determine server from API key.' }, t0);
      }

      const { getProvisioner, getConfig } = await import('../../../index');
      const { getServerDb } = await import('@posta/core');
      const config = await getConfig();
      const provisioner = await getProvisioner();
      const client = getServerDb(config, serverId);
      const msgDb = await provisioner.openServerDb(serverId, client);

      const msg = await msgDb.db.get(`SELECT id FROM messages WHERE id = $1`, [messageId]) as any;
      if (!msg) {
        return renderError('MessageNotFound', { message: `No message found with id ${messageId}` }, t0);
      }

      const deliveries = await msgDb.db.query(
        `SELECT id, status, details, timestamp, time FROM deliveries WHERE message_id = $1 ORDER BY timestamp DESC`,
        [messageId],
      ) as any[];

      return renderSuccess({ deliveries }, t0);
    } catch (err: any) {
      return renderError('InternalError', { message: err.message ?? 'An error occurred' }, t0);
    }
  }, {
    query: t.Object({
      id: t.Optional(t.String()),
    }),
    detail: { tags: ['Messages'], summary: 'Get delivery attempts (legacy alias using query params)' },
  })

  .get('/:id', async (c: any) => {
    const t0 = Date.now();
    try {
      const messageId = parseInt(c.params.id, 10);
      if (isNaN(messageId)) {
        return renderError('InvalidParameter', { message: '`id` must be a numeric message ID' }, t0);
      }

      const serverId = c.auth?.server?.id;
      if (!serverId) {
        return renderError('ServerRequired', { message: 'Could not determine server from API key.' }, t0);
      }

      const expand = c.query.expand as string | undefined;
      const expansions = parseExpansions(expand);

      const { getProvisioner, getConfig, MessageStore } = await import('../../../index');
      const { getServerDb } = await import('@posta/core');
      const config = await getConfig();
      const provisioner = await getProvisioner();
      const client = getServerDb(config, serverId);
      const msgDb = await provisioner.openServerDb(serverId, client);
      const msg = await msgDb.db.get(`SELECT * FROM messages WHERE id = $1`, [messageId]) as any;

      if (!msg) {
        return renderError('MessageNotFound', { message: `No message found with id ${messageId}` }, t0);
      }

      const message: Record<string, any> = { id: msg.id, token: msg.token };

      if (expansions === true || expansions.includes('status')) {
        message.status = {
          status: msg.status ?? null,
          last_delivery_attempt: msg.last_delivery_attempt ?? null,
          held: msg.held === 1 || msg.held === true,
          hold_expiry: msg.hold_expiry ?? null,
        };
      }

      if (expansions === true || expansions.includes('details')) {
        message.details = {
          rcpt_to: msg.rcpt_to,
          mail_from: msg.mail_from,
          subject: msg.subject,
          message_id: msg.message_id,
          timestamp: msg.timestamp,
          direction: msg.scope,
          size: msg.size,
          bounce: msg.bounce === 1 || msg.bounce === true,
          bounce_for_id: msg.bounce_for_id ?? null,
          tag: msg.tag ?? null,
          received_with_ssl: msg.received_with_ssl === 1 || msg.received_with_ssl === true,
        };
      }

      if (expansions === true || expansions.includes('headers')) {
        const store = new MessageStore(msgDb);
        let raw = '';
        try { raw = await store.getRawHeaders(msg); } catch { raw = ''; }
        const headers: Record<string, string[]> = {};
        for (const line of raw.split('\r\n')) {
          const idx = line.indexOf(':');
          if (idx > 0) {
            const key = line.slice(0, idx).toLowerCase();
            const val = line.slice(idx + 1).trim();
            if (!headers[key]) headers[key] = [];
            headers[key].push(val);
          }
        }
        message.headers = headers;
      }

      return renderSuccess({ message }, t0);
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        return renderError('MessageNotFound', { message: `No message found with id ${c.params.id}` }, t0);
      }
      return renderError('InternalError', { message: err.message ?? 'An error occurred' }, t0);
    }
  }, {
    params: t.Object({ id: t.String() }),
    query: t.Object({
      expand: t.Optional(t.String()),
    }),
  })

  .get('/:id/deliveries', async (c: any) => {
    const t0 = Date.now();
    try {
      const messageId = parseInt(c.params.id, 10);
      if (isNaN(messageId)) {
        return renderError('InvalidParameter', { message: '`id` must be a numeric message ID' }, t0);
      }

      const serverId = c.auth?.server?.id;
      if (!serverId) {
        return renderError('ServerRequired', { message: 'Could not determine server from API key.' }, t0);
      }

      const { getProvisioner, getConfig } = await import('../../../index');
      const { getServerDb } = await import('@posta/core');
      const config = await getConfig();
      const provisioner = await getProvisioner();
      const client = getServerDb(config, serverId);
      const msgDb = await provisioner.openServerDb(serverId, client);

      const msg = await msgDb.db.get(`SELECT id FROM messages WHERE id = $1`, [messageId]) as any;
      if (!msg) {
        return renderError('MessageNotFound', { message: `No message found with id ${messageId}` }, t0);
      }

      const deliveries = await msgDb.db.query(
        `SELECT id, status, details, timestamp, time FROM deliveries WHERE message_id = $1 ORDER BY timestamp DESC`,
        [messageId],
      ) as any[];

      return renderSuccess({ deliveries }, t0);
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        return renderError('MessageNotFound', { message: `No message found with id ${c.params.id}` }, t0);
      }
      return renderError('InternalError', { message: err.message ?? 'An error occurred' }, t0);
    }
  }, {
    params: t.Object({ id: t.String() }),
  });

function parseExpansions(expand?: string): true | string[] {
  if (!expand) return [];
  if (expand === 'true' || expand === '1') return true;

  const expansions = expand
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (expansions.length === 0) return [];
  return expansions;
}

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

export const sendRoutes = new Elysia({ prefix: '/api/v1/send' })

  .use(requireApiAuth)

  .post('/', async (c: any) => {
    return await handleSend(c);
  }, {
    body: t.Object({
      to: t.Optional(t.Union([t.String(), t.Array(t.String())])),
      cc: t.Optional(t.Union([t.String(), t.Array(t.String())])),
      bcc: t.Optional(t.Union([t.String(), t.Array(t.String())])),
      from: t.Optional(t.String()),
      sender: t.Optional(t.String()),
      subject: t.Optional(t.String()),
      reply_to: t.Optional(t.String()),
      plain_body: t.Optional(t.String()),
      html_body: t.Optional(t.String()),
      tag: t.Optional(t.String()),
      bounce: t.Optional(t.Boolean()),
      headers: t.Optional(t.Record(t.String(), t.String())),
      attachments: t.Optional(t.Array(t.Object({
        name: t.String(),
        content_type: t.Optional(t.String()),
        data: t.String(),
        base64: t.Optional(t.Boolean()),
      }))),
    }),
  })

  .post('/message', async (c: any) => {
    return await handleSend(c);
  }, {
    body: t.Object({
      to: t.Optional(t.Union([t.String(), t.Array(t.String())])),
      cc: t.Optional(t.Union([t.String(), t.Array(t.String())])),
      bcc: t.Optional(t.Union([t.String(), t.Array(t.String())])),
      from: t.Optional(t.String()),
      sender: t.Optional(t.String()),
      subject: t.Optional(t.String()),
      reply_to: t.Optional(t.String()),
      plain_body: t.Optional(t.String()),
      html_body: t.Optional(t.String()),
      tag: t.Optional(t.String()),
      bounce: t.Optional(t.Boolean()),
      headers: t.Optional(t.Record(t.String(), t.String())),
      attachments: t.Optional(t.Array(t.Object({
        name: t.String(),
        content_type: t.Optional(t.String()),
        data: t.String(),
        base64: t.Optional(t.Boolean()),
      }))),
    }),
    detail: { tags: ['Send'], summary: 'Send email (legacy alias for POST /api/v1/send)' },
  })

  .post('/raw', async (c: any) => {
    const t0 = Date.now();
    try {
      const body = c.body;

      if (!body.rcpt_to || !Array.isArray(body.rcpt_to) || body.rcpt_to.length === 0) {
        return renderError('MissingParameter', { message: '`rcpt_to` parameter is required as an array' }, t0);
      }
      if (!body.mail_from) {
        return renderError('MissingParameter', { message: '`mail_from` parameter is required' }, t0);
      }
      if (!body.data) {
        return renderError('MissingParameter', { message: '`data` parameter is required (base64-encoded raw message)' }, t0);
      }

      const serverId = c.auth?.server?.id;
      if (!serverId) {
        return renderError('ServerRequired', { message: 'Could not determine server from API key.' }, t0);
      }

      const { getDb, getProvisioner, getConfig, MessageStore } = await import('../../../index');
      const { getServerDb } = await import('@posta/core');
      const config = await getConfig();
      const db = await getDb();
      const provisioner = await getProvisioner();
      const rawMessage = Buffer.from(body.data, 'base64').toString('binary');

      const client = getServerDb(config, serverId);
      const msgDb = await provisioner.openServerDb(serverId, client);
      const store = new MessageStore(msgDb);
      const raw = await store.insertRawMessage(rawMessage);

      const separatorIndex = rawMessage.search(/\r?\n\r?\n/);
      const headersSection = separatorIndex >= 0 ? rawMessage.slice(0, separatorIndex) : rawMessage;
      const msgIdMatch = headersSection.match(/^Message-ID:\s*(\S+)/im);
      const fromMatch = headersSection.match(/^From:\s*(.+)$/im);
      const subjectMatch = headersSection.match(/^Subject:\s*(.+)$/im);
      const messageId = msgIdMatch?.[1] ?? `<${crypto.randomUUID()}@posta>`;

      const results: Record<string, { id: number; token: string }> = {};
      let firstMessageId: number | null = null;

      for (const rcpt of body.rcpt_to) {
        const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        const msgId = await store.create({
          scope: body.bounce ? 'bounce' : 'outgoing',
          rcpt_to: rcpt,
          mail_from: body.mail_from,
          subject: subjectMatch?.[1] ?? '',
          message_id: messageId,
          raw_table: raw.tableName,
          raw_headers_id: raw.headersId,
          raw_body_id: raw.bodyId,
          status: 'Pending',
          received_with_ssl: false,
          bounce: body.bounce ?? false,
          credential_id: c.auth?.credential?.id ?? null,
        });

        if (firstMessageId === null) firstMessageId = msgId;

        const { createQueuedMessage, allocateIpAddress } = await import('@posta/core');
        const ipAddressId = await allocateIpAddress(db, config.posta.use_ip_pools, serverId, body.bounce ? 'bounce' : 'outgoing', rcpt);
        await createQueuedMessage(db, { serverId, messageId: msgId, priority: 0, ipAddressId });

        results[rcpt] = { id: msgId, token };
      }

      return renderSuccess({ message_id: messageId, messages: results }, t0);
    } catch (err: any) {
      console.error('[send/raw] error:', err);
      return renderError('InternalError', { message: err.message ?? 'An error occurred' }, t0);
    }
  }, {
    body: t.Object({
      rcpt_to: t.Array(t.String()),
      mail_from: t.String(),
      data: t.String(),
      bounce: t.Optional(t.Boolean()),
    }),
  });

function buildMimeMessage(params: any): string {
  const headers: string[] = [];
  const msgUuid = crypto.randomUUID();
  const messageId = `<${msgUuid}@posta>`;

  const toStr = typeof params.to === 'string' ? params.to : (params.to ?? []).join(', ');
  const ccStr = typeof params.cc === 'string' ? params.cc : (params.cc ?? []).join(', ');

  if (toStr) headers.push(`To: ${toStr}`);
  if (ccStr) headers.push(`Cc: ${ccStr}`);
  if (params.from) headers.push(`From: ${params.from}`);
  if (params.sender) headers.push(`Sender: ${params.sender}`);
  if (params.subject) headers.push(`Subject: ${params.subject}`);
  if (params.reply_to) headers.push(`Reply-To: ${params.reply_to}`);
  if (params.tag) headers.push(`X-Posta-Tag: ${params.tag}`);

  headers.push(`Message-ID: ${messageId}`);
  headers.push(`Date: ${new Date().toUTCString()}`);
  headers.push(`MIME-Version: 1.0`);

  if (params.headers) {
    for (const [key, value] of Object.entries(params.headers)) {
      headers.push(`${key}: ${value}`);
    }
  }

  const hasHtml = !!params.html_body;
  const hasPlain = !!params.plain_body;

  if (hasHtml && hasPlain) {
    const boundary = `=_${crypto.randomUUID().replace(/-/g, '')}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Type: text/plain; charset=UTF-8\r\n\r\n`;
    body += `${params.plain_body}\r\n`;
    body += `--${boundary}\r\n`;
    body += `Content-Type: text/html; charset=UTF-8\r\n\r\n`;
    body += `${params.html_body}\r\n`;
    body += `--${boundary}--\r\n`;

    return headers.join('\r\n') + '\r\n\r\n' + body;
  } else if (hasHtml) {
    headers.push(`Content-Type: text/html; charset=UTF-8`);
    return headers.join('\r\n') + '\r\n\r\n' + params.html_body;
  } else {
    headers.push(`Content-Type: text/plain; charset=UTF-8`);
    return headers.join('\r\n') + '\r\n\r\n' + (params.plain_body ?? '');
  }
}

function normalizeAddresses(input?: string | string[]): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return input.split(',').map((s) => s.trim()).filter(Boolean);
}

async function handleSend(c: any): Promise<any> {
  const t0 = Date.now();
  try {
    const body = c.body;

    if (!body.to && !body.cc && !body.bcc) {
      return renderError('NoRecipients', { message: 'At least one recipient is required' }, t0);
    }
    if (!body.from) {
      return renderError('FromAddressMissing', { message: 'The From address is required' }, t0);
    }
    if (!body.plain_body && !body.html_body) {
      return renderError('NoContent', { message: 'Either plain_body or html_body is required' }, t0);
    }

    const serverId = c.auth?.server?.id;
    if (!serverId) {
      return renderError('ServerRequired', { message: 'Could not determine server from API key.' }, t0);
    }

    const { getDb, getProvisioner, getConfig, MessageStore } = await import('../../../index');
    const { getServerDb } = await import('@posta/core');
    const config = await getConfig();
    const db = await getDb();
    const provisioner = await getProvisioner();
    const mimeMessage = buildMimeMessage(body);

    const client = getServerDb(config, serverId);
    const msgDb = await provisioner.openServerDb(serverId, client);
    const store = new MessageStore(msgDb);
    const raw = await store.insertRawMessage(mimeMessage);

    const toAddresses = normalizeAddresses(body.to);
    const ccAddresses = normalizeAddresses(body.cc);
    const bccAddresses = normalizeAddresses(body.bcc);
    const allAddresses = [...toAddresses, ...ccAddresses, ...bccAddresses];

    const subject = body.subject ?? '';

    let domainId: number | undefined;
    if (body.from) {
      const fromDomain = body.from.split('@')[1];
      if (fromDomain) {
        const domainRow = await db.get(`SELECT id FROM domains WHERE name = $1 AND server_id = $2`, [fromDomain, serverId]) as any;
        domainId = domainRow?.id;
      }
    }

    const results: Record<string, { id: number; token: string }> = {};
    let firstMessageId: number | null = null;

    for (const address of allAddresses) {
      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const msgId = await store.create({
        scope: 'outgoing',
        rcpt_to: address,
        mail_from: body.from,
        subject,
        message_id: mimeMessage.match(/^Message-ID:\s*(\S+)/m)?.[1] ?? `<${crypto.randomUUID()}@posta>`,
        domain_id: domainId,
        credential_id: c.auth?.credential?.id ?? null,
        tag: body.tag ?? null,
        raw_table: raw.tableName,
        raw_headers_id: raw.headersId,
        raw_body_id: raw.bodyId,
        status: 'Pending',
        received_with_ssl: true,
        bounce: body.bounce ?? false,
      });

      if (firstMessageId === null) firstMessageId = msgId;

      const { createQueuedMessage, allocateIpAddress } = await import('@posta/core');
      const ipAddressId = await allocateIpAddress(db, config.posta.use_ip_pools, serverId, 'outgoing', address);
      await createQueuedMessage(db, { serverId, messageId: msgId, priority: 0, ipAddressId });

      results[address] = { id: msgId, token };
    }

    return renderSuccess({
      message_id: mimeMessage.match(/^Message-ID:\s*(\S+)/m)?.[1] ?? `<${crypto.randomUUID()}@posta>`,
      messages: results,
    }, t0);
  } catch (err: any) {
    console.error('[send] error:', err);
    return renderError('InternalError', { message: err.message ?? 'An error occurred' }, t0);
  }
}

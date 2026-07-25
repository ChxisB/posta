import { Elysia, t } from 'elysia';

/**
 * Message routes — queries per-server MessageDB.
 * Path: /org/:orgPermalink/servers/:serverId/messages
 */
export const messageRoutes = new Elysia({ prefix: '/org/:orgPermalink/servers/:serverId/messages' })

  // ─── List messages ─────────────────────────────────────
  .get('/', async (c: any) => {
    const page = parseInt(c.query.page ?? '1');
    const scope = c.query.scope ?? '';
    const status = c.query.status ?? '';
    const limit = 30;
    const offset = (page - 1) * limit;

    const { getProvisioner } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);

    // Build WHERE clause
    let where = '';
    const bindings: any[] = [];
    if (scope) { where += 'WHERE scope = ? '; bindings.push(scope); }
    if (status) { where += `${scope ? 'AND' : 'WHERE'} status = ? `; bindings.push(status); }

    const stmt = msgDb.db.query(`SELECT COUNT(*) as c FROM messages ${where}`);
    const countRow = stmt.get(...bindings) as any;
    const total = countRow?.c ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    bindings.push(limit, offset);
    const messages = msgDb.db.query(
      `SELECT id, token, scope, rcpt_to, mail_from, subject, status, message_id, timestamp, tag, size, bounced, hold_expiry
       FROM messages ${where}
       ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    ).all(...bindings) as any[];

    c.set.status = 200;
    return { messages, page, total_pages: totalPages, per_page: limit };
  }, {
    query: t.Object({
      page: t.Optional(t.String()),
      scope: t.Optional(t.String()),
      status: t.Optional(t.String()),
      q: t.Optional(t.String()),
    }),
    detail: { tags: ['Messages'], summary: 'List messages' },
  })

  .get('/incoming', async (c: any) => {
    c.query.scope = 'incoming';
    c.query.status = '';
    return await handleList(c);
  }, { detail: { tags: ['Messages'], summary: 'List incoming messages' } })

  .get('/outgoing', async (c: any) => {
    c.query.scope = 'outgoing';
    c.query.status = '';
    return await handleList(c);
  }, { detail: { tags: ['Messages'], summary: 'List outgoing messages' } })

  .get('/held', async (c: any) => {
    c.query.scope = '';
    c.query.status = 'Held';
    return await handleList(c);
  }, { detail: { tags: ['Messages'], summary: 'List held messages' } })

  // ─── Message counts — for dashboard stat cards ─────────
  .get('/counts', async (c: any) => {
    const { getProvisioner } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const incoming = (msgDb.db.query(
      `SELECT COUNT(*) as c FROM messages WHERE scope = 'incoming'`,
    ).get() as any)?.c ?? 0;
    const outgoing = (msgDb.db.query(
      `SELECT COUNT(*) as c FROM messages WHERE scope = 'outgoing'`,
    ).get() as any)?.c ?? 0;
    const held = (msgDb.db.query(
      `SELECT COUNT(*) as c FROM messages WHERE status = 'Held'`,
    ).get() as any)?.c ?? 0;
    const bounced = (msgDb.db.query(
      `SELECT COUNT(*) as c FROM messages WHERE status = 'HardFail' OR status = 'SoftFail' OR bounced = 1`,
    ).get() as any)?.c ?? 0;
    c.set.status = 200;
    return { incoming, outgoing, held, bounced };
  }, { detail: { tags: ['Messages'], summary: 'Get message counts' } })

  // ─── Single message detail ─────────────────────────────
  .get('/:messageId', async (c: any) => {
    const id = parseInt(c.params.messageId);
    if (isNaN(id)) { c.set.status = 400; return { error: 'Invalid ID' }; }

    const { getProvisioner } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const msg = msgDb.db.query(`SELECT * FROM messages WHERE id = ?`).get(id) as any;
    if (!msg) { c.set.status = 404; return { error: 'MessageNotFound' }; }

    c.set.status = 200;
    return { message: msg };
  }, {
    params: t.Object({ messageId: t.String() }),
    detail: { tags: ['Messages'], summary: 'Get message details' },
  })

  // ─── Activity timeline ─────────────────────────────────
  .get('/:messageId/activity', async (c: any) => {
    const { getProvisioner } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const deliveries = msgDb.db.query(
      `SELECT status, details, timestamp, time FROM deliveries WHERE message_id = ? ORDER BY timestamp DESC`,
    ).all(c.params.messageId) as any[];
    c.set.status = 200;
    return { activity: deliveries };
  }, { detail: { tags: ['Messages'], summary: 'Get message activity timeline' } })

  // ─── Plain text body ──────────────────────────────────
  .get('/:messageId/plain', async (c: any) => {
    const { getProvisioner, MessageStore } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const msg = msgDb.db.query(`SELECT * FROM messages WHERE id = ?`).get(c.params.messageId) as any;
    if (!msg) { c.set.status = 404; return { body: '' }; }
    const store = new MessageStore(msgDb);
    let body = '';
    try { body = store.getRawBody(msg); } catch { body = ''; }
    c.set.status = 200;
    return { body };
  }, { detail: { tags: ['Messages'], summary: 'Get plain text body' } })

  // ─── HTML body ────────────────────────────────────────
  .get('/:messageId/html', async (c: any) => {
    const { getProvisioner, MessageStore } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const msg = msgDb.db.query(`SELECT * FROM messages WHERE id = ?`).get(c.params.messageId) as any;
    if (!msg) { c.set.status = 404; return { body: '' }; }
    const store = new MessageStore(msgDb);
    let body = '';
    try { body = store.getRawBody(msg); } catch { body = ''; }
    c.set.status = 200;
    return { body };
  }, { detail: { tags: ['Messages'], summary: 'Get HTML body' } })

  // ─── Raw HTML body (returns HTML directly) ────────────
  .get('/:messageId/html_raw', async (c: any) => {
    const { getProvisioner, MessageStore } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const msg = msgDb.db.query(`SELECT * FROM messages WHERE id = ?`).get(c.params.messageId) as any;
    if (!msg) { c.set.status = 404; return new Response('', { status: 404 }); }
    const store = new MessageStore(msgDb);
    let body = '';
    try { body = store.getRawBody(msg); } catch { body = ''; }
    return new Response(body, { headers: { 'Content-Type': 'text/html' } });
  }, { detail: { tags: ['Messages'], summary: 'Get raw HTML body' } })

  // ─── Attachments ──────────────────────────────────────
  .get('/:messageId/attachments', async (c: any) => {
    const { getProvisioner, MessageStore } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const msg = msgDb.db.query(`SELECT * FROM messages WHERE id = ?`).get(c.params.messageId) as any;
    if (!msg) { c.set.status = 404; return { attachments: [] }; }
    const store = new MessageStore(msgDb);
    let raw = '';
    try { raw = store.getRawMessage(msg); } catch { raw = ''; }
    const attachments = parseAttachmentSummaries(raw);
    c.set.status = 200;
    return { attachments };
  }, { detail: { tags: ['Messages'], summary: 'List message attachments' } })

  // ─── Single attachment download ────────────────────────
  .get('/:messageId/attachment', async (c: any) => {
    const index = parseInt(c.query.index ?? '0', 10);
    if (isNaN(index) || index < 0) { c.set.status = 400; return { error: 'InvalidIndex' }; }

    const { getProvisioner, MessageStore } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const msg = msgDb.db.query(`SELECT * FROM messages WHERE id = ?`).get(c.params.messageId) as any;
    if (!msg) { c.set.status = 404; return { error: 'MessageNotFound' }; }

    const store = new MessageStore(msgDb);
    let raw = '';
    try { raw = store.getRawMessage(msg); } catch { raw = ''; }
    if (!raw) { c.set.status = 404; return { error: 'NoRawMessage' }; }

    const attachments = parseMimeAttachments(raw);
    if (index >= attachments.length) { c.set.status = 404; return { error: 'AttachmentNotFound' }; }

    const att = attachments[index];
    return new Response(att.data, {
      headers: {
        'Content-Type': att.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${att.filename || 'attachment'}"`,
        'Content-Transfer-Encoding': 'binary',
      },
    });
  }, {
    query: t.Object({ index: t.Optional(t.String()) }),
    detail: { tags: ['Messages'], summary: 'Download a single attachment by index' },
  })

  // ─── Headers (parsed from raw message) ────────────────
  .get('/:messageId/headers', async (c: any) => {
    const { getProvisioner, MessageStore } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const msg = msgDb.db.query(`SELECT * FROM messages WHERE id = ?`).get(c.params.messageId) as any;
    if (!msg) { c.set.status = 404; return { headers: {} }; }
    const store = new MessageStore(msgDb);
    let raw = '';
    try { raw = store.getRawHeaders(msg); } catch { raw = ''; }
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
    c.set.status = 200;
    return { headers };
  }, { detail: { tags: ['Messages'], summary: 'Get message headers' } })

  // ─── Download raw message ─────────────────────────────
  .get('/:messageId/download', async (c: any) => {
    const { getProvisioner, MessageStore } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const msg = msgDb.db.query(`SELECT * FROM messages WHERE id = ?`).get(c.params.messageId) as any;
    if (!msg) { c.set.status = 404; return new Response('', { status: 404 }); }
    const store = new MessageStore(msgDb);
    let raw = '';
    try { raw = store.getRawMessage(msg); } catch { raw = ''; }
    return new Response(raw, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment' } });
  }, { detail: { tags: ['Messages'], summary: 'Download raw message' } })

  // ─── Spam checks ──────────────────────────────────────
  .get('/:messageId/spam_checks', async (c: any) => {
    const { getProvisioner } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const checks = msgDb.db.query(`SELECT * FROM spam_checks WHERE message_id = ?`).all(c.params.messageId) as any[];
    c.set.status = 200;
    return { spam_checks: checks };
  }, { detail: { tags: ['Messages'], summary: 'Get spam check results' } })

  // ─── Delivery attempts ────────────────────────────────
  .get('/:messageId/deliveries', async (c: any) => {
    const { getProvisioner } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const deliveries = msgDb.db.query(
      `SELECT id, status, details, timestamp, time FROM deliveries WHERE message_id = ? ORDER BY timestamp DESC`,
    ).all(c.params.messageId) as any[];
    c.set.status = 200;
    return { deliveries };
  }, { detail: { tags: ['Messages'], summary: 'Get delivery attempts' } })

  // ─── Actions ──────────────────────────────────────────
  .post('/:messageId/retry', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const { createQueuedMessage } = await import('@posta/core');
    createQueuedMessage(db, { serverId: parseInt(c.params.serverId), messageId: parseInt(c.params.messageId) });
    c.set.status = 200;
    return { status: 'queued' };
  }, { detail: { tags: ['Messages'], summary: 'Retry delivery' } })

  .post('/:messageId/cancel_hold', async (c: any) => {
    const { getProvisioner } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    msgDb.update('messages', { status: 'Pending', hold_expiry: null }, { where: { id: parseInt(c.params.messageId) } });
    c.set.status = 200;
    return { status: 'cancelled' };
  }, { detail: { tags: ['Messages'], summary: 'Cancel hold on a message' } })

  .post('/:messageId/remove_from_queue', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    db.run(`DELETE FROM queued_messages WHERE message_id = ? AND server_id = ?`, [c.params.messageId, c.params.serverId]);
    c.set.status = 200;
    return { removed: true };
  }, { detail: { tags: ['Messages'], summary: 'Remove message from queue' } })

  // ─── Suppressions per server ──────────────────────────
  .get('/suppressions', async (c: any) => {
    const page = parseInt(c.query.page ?? '1');
    const limit = 20;
    const offset = (page - 1) * limit;
    const { getProvisioner } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const suppressions = msgDb.db.query(
      `SELECT * FROM suppressions ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).all(limit, offset) as any[];
    const totalRows = msgDb.db.query(`SELECT COUNT(*) as c FROM suppressions`).get() as any;
    const totalPages = Math.max(1, Math.ceil((totalRows?.c ?? 0) / limit));
    c.set.status = 200;
    return { suppressions, page, total_pages: totalPages };
  }, { detail: { tags: ['Messages'], summary: 'List suppressions' } })

  .post('/suppressions', async (c: any) => {
    const { getProvisioner } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    const { type, address, reason } = c.body;
    const id = msgDb.insert('suppressions', {
      type, address, reason: reason ?? null,
      created_at: Date.now() / 1000,
    });
    c.set.status = 201;
    return { suppression: { id, type, address } };
  }, {
    body: t.Object({
      type: t.String(), address: t.String(),
      reason: t.Optional(t.String()),
    }),
    detail: { tags: ['Messages'], summary: 'Add a suppression' },
  })

  .delete('/suppressions/:suppressionId', async (c: any) => {
    const { getProvisioner } = await import('../../index');
    const msgDb = getProvisioner().openServerDb(c.params.serverId);
    msgDb.delete('suppressions', { where: { id: parseInt(c.params.suppressionId) } });
    c.set.status = 200;
    return { deleted: true };
  }, { detail: { tags: ['Messages'], summary: 'Remove a suppression' } })

  // ─── Send test message ─────────────────────────────────
  .post('/', async (c: any) => {
    const { getConfig, getDb } = await import('../../index');
    const config = getConfig();
    const mainDb = getDb();
    const server = mainDb.query(`SELECT * FROM servers WHERE id = ?`).get(c.params.serverId) as any;
    if (!server) { c.set.status = 404; return { error: 'ServerNotFound' }; }

    const { to, from } = c.body as { to: string; from?: string };
    const { sendTestEmail } = await import('@posta/message-db');
    const messageId = sendTestEmail(config, parseInt(c.params.serverId), to, from ?? config.smtp.from_address);
    c.set.status = 202;
    return { status: 'queued', message_id: messageId };
  }, {
    body: t.Object({
      to: t.String(),
      from: t.Optional(t.String()),
    }),
    detail: { tags: ['Messages'], summary: 'Send a test message' },
  });

// ─── Shared list handler ─────────────────────────────────

async function handleList(c: any): Promise<any> {
  const page = parseInt(c.query.page ?? '1');
  const scope = c.query.scope ?? '';
  const status = c.query.status ?? '';
  const q = c.query.q ?? '';
  const limit = 30;
  const offset = (page - 1) * limit;

  const { getProvisioner } = await import('../../index');
  const msgDb = getProvisioner().openServerDb(c.params.serverId);

  let where = '';
  const bindings: any[] = [];
  if (scope) { where += 'WHERE scope = ? '; bindings.push(scope); }
  if (status) { where += `${scope ? 'AND' : 'WHERE'} status = ? `; bindings.push(status); }

  // Parse query string (q param) for advanced search
  if (q) {
    const { QueryString } = await import('@posta/core');
    const qs = new QueryString(q);
    if (!qs.isEmpty()) {
      const fieldMap: Record<string, { column: string; exact: boolean }> = {
        to: { column: 'rcpt_to', exact: false },
        from: { column: 'mail_from', exact: false },
        subject: { column: 'subject', exact: false },
        tag: { column: 'tag', exact: true },
        token: { column: 'token', exact: true },
        status: { column: 'status', exact: true },
        scope: { column: 'scope', exact: true },
      };
      for (const [key, cfg] of Object.entries(fieldMap)) {
        const val = qs.get(key);
        if (val !== undefined && val !== null) {
          const prefix = bindings.length === 0 ? 'WHERE' : 'AND';
          if (cfg.exact) {
            where += `${prefix} ${cfg.column} = ? `;
            bindings.push(val);
          } else {
            where += `${prefix} ${cfg.column} LIKE ? `;
            bindings.push(`%${val}%`);
          }
        }
      }
    }
  }

  const countStmt = msgDb.db.query(`SELECT COUNT(*) as c FROM messages ${where}`);
  const countRow = (countStmt as any).get(...bindings) as any;
  const total = countRow?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  bindings.push(limit, offset);
  const messages = (msgDb.db.query(
    `SELECT id, token, scope, rcpt_to, mail_from, subject, status, message_id, timestamp, tag, size, bounced, hold_expiry
     FROM messages ${where}
     ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
  ) as any).all(...bindings) as any[];

  c.set.status = 200;
  return { messages, page, total_pages: totalPages, per_page: limit };
}

// ─── MIME attachment helpers ─────────────────────────────

interface ParsedAttachment {
  filename: string;
  contentType: string;
  size: number;
  data: Uint8Array;
}

/**
 * Parse attachment summaries (filename, content-type, size) from a raw MIME message.
 * Used by the attachments list endpoint.
 */
function parseAttachmentSummaries(raw: string): Array<{ filename: string; content_type: string; size: number; index: number }> {
  const attachments = parseMimeAttachments(raw);
  return attachments.map((att, idx) => ({
    filename: att.filename,
    content_type: att.contentType,
    size: att.data.byteLength,
    index: idx,
  }));
}

/**
 * Parse all attachments from a raw MIME message.
 * Handles multipart/mixed and multipart/related boundaries.
 */
function parseMimeAttachments(raw: string): ParsedAttachment[] {
  const attachments: ParsedAttachment[] = [];

  // Find the boundary from Content-Type header
  const boundaryMatch = raw.match(/Content-Type:\s*multipart\/\w+;\s*boundary="?([^";\r\n]+)"?/i);
  if (!boundaryMatch) return attachments;

  const boundary = boundaryMatch[1];
  const parts = raw.split(`--${boundary}`);

  for (const part of parts) {
    // Skip preamble and epilogue
    if (part.trim() === '' || part.trim() === '--') continue;

    const headerBodySplit = part.search(/\r?\n\r?\n/);
    if (headerBodySplit < 0) continue;

    const partHeaders = part.slice(0, headerBodySplit);
    const partBody = part.slice(headerBodySplit + part.match(/\r?\n\r?\n/)![0].length);

    // Check if this part is an attachment (has Content-Disposition: attachment or has a filename)
    const dispositionMatch = partHeaders.match(/Content-Disposition:\s*attachment/i);
    const filenameMatch = partHeaders.match(/(?:Content-Disposition|Content-Type):[^;]*;\s*(?:name|filename)\*?="([^"]+)"/i)
      ?? partHeaders.match(/(?:Content-Disposition|Content-Type):[^;]*;\s*(?:name|filename)\*?=\s*([^\s;]+)/i);

    if (!dispositionMatch && !filenameMatch) continue;

    const contentTypeMatch = partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i);
    const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
    const filename = filenameMatch ? filenameMatch[1] : 'attachment';

    // Decode body (check for base64 encoding)
    const encodingMatch = partHeaders.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    const encoding = encodingMatch ? encodingMatch[1].toLowerCase() : '7bit';

    let data: Uint8Array;
    if (encoding === 'base64') {
      const decoded = Buffer.from(partBody.replace(/\r?\n/g, ''), 'base64');
      data = new Uint8Array(decoded);
    } else {
      data = new Uint8Array(Buffer.from(partBody, 'binary'));
    }

    attachments.push({ filename, contentType, size: data.byteLength, data });
  }

  return attachments;
}

import type { PostaConfig } from '@posta/core';
import { getMainDb } from '@posta/core';
import { computeRetryDelay, FailureReason, BackoffStrategy } from '@posta/core';
import type { FailureReasonType } from '@posta/core';
import { checkWithRspamd, scanWithClamav, checkWithSpamAssassin } from '@posta/core';
import { MessageStore } from '@posta/message-db';
import { BounceProcessor } from '../bounce';

const MAX_ATTEMPTS = 18;
const BATCH_SIZE = 5;

/**
 * ProcessQueuedMessages job.
 */
export async function processQueuedMessagesJob(config: PostaConfig): Promise<boolean> {
  const mainDb = getMainDb(config);
  const locker = `worker-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();
  const lockTime = new Date(now).toISOString();

  mainDb.run(`
    UPDATE queued_messages
    SET locked_by = ?, locked_at = ?, attempts = COALESCE(attempts, 0) + 1
    WHERE id IN (
      SELECT id FROM queued_messages
      WHERE locked_by IS NULL
        AND locked_at IS NULL
        AND (retry_after IS NULL OR retry_after <= datetime('now'))
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    )
  `, [locker, lockTime, BATCH_SIZE]);

  const messages = mainDb.query(
    `SELECT * FROM queued_messages WHERE locked_by = ? AND locked_at = ?`,
  ).all(locker, lockTime) as any[];

  if (messages.length === 0) return false;

  await Promise.allSettled(
    messages.map((msg) => processMessage(config, msg, locker)),
  );

  return true;
}

async function processMessage(
  config: PostaConfig,
  queuedMessage: any,
  locker: string,
): Promise<void> {
  const mainDb = getMainDb(config);
  const startTime = Date.now();
  const attemptNum = queuedMessage.attempts ?? 1;

  try {
    const serverId = queuedMessage.server_id;
    const provisioner = new (await import('@posta/message-db')).MessageDbProvisioner(config);
    const msgDb = provisioner.openServerDb(serverId);
    const store = new MessageStore(msgDb);

    const rows = msgDb.query(
      `SELECT * FROM messages WHERE id = ?`,
      [queuedMessage.message_id],
    ) as any[];

    if (rows.length === 0) {
      console.log(`[worker] queued msg ${queuedMessage.id}: message ${queuedMessage.message_id} not found`);
      await recordFinalFailure(mainDb, queuedMessage, FailureReason.Unknown, 'Message not found', attemptNum, startTime);
      return;
    }

    const message = rows[0];

    if (message.scope === 'outgoing') {
      await processOutgoing(config, msgDb, store, queuedMessage, message, locker, attemptNum, startTime);
    } else {
      await processIncoming(config, msgDb, store, queuedMessage, message, locker, attemptNum, startTime);
    }
  } catch (err: any) {
    console.error(`[worker] processMessage error (msg ${queuedMessage.id}):`, err.message);
    await handleRetry(mainDb, queuedMessage, FailureReason.Unknown, err.message, attemptNum, startTime, locker);
  }
}

/**
 * Process outgoing message — enrich with Received/DKIM headers, then deliver via SMTP.
 */
async function processOutgoing(
  config: PostaConfig,
  msgDb: any,
  store: MessageStore,
  queuedMessage: any,
  message: any,
  locker: string,
  attemptNum: number,
  startTime: number,
): Promise<void> {
  const mainDb = getMainDb(config);

  if (!message.rcpt_to) {
    await recordFinalFailure(mainDb, queuedMessage, FailureReason.HardFail,
      "Message doesn't have an RCPT to", attemptNum, startTime);
    return;
  }

  // ── Check domain exists ──────────────────────────────
  if (message.domain_id) {
    const domain = mainDb.query(`SELECT id FROM domains WHERE id = ?`).get(message.domain_id) as any;
    if (!domain) {
      insertDelivery(msgDb, message.id, 'HardFail', "Message's domain no longer exists");
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
      return;
    }
  }

  // ── Add tag from X-Posta-Tag header ─────────────────
  if (!message.tag) {
    try {
      const rawHeaders = store.getRawHeaders(message);
      const tagMatch = rawHeaders.match(/^X-Posta-Tag:\s*(.+)$/im);
      if (tagMatch) {
        msgDb.update('messages', { tag: tagMatch[1].trim() }, { where: { id: message.id } });
      }
    } catch {}
  }

  // ── Hold if credential is set to hold ────────────────
  if (!queuedMessage.manual && message.credential_id) {
    const credential = mainDb.query(`SELECT hold FROM credentials WHERE id = ?`).get(message.credential_id) as any;
    if (credential?.hold) {
      insertDelivery(msgDb, message.id, 'Held', 'Credential is configured to hold all messages authenticated by it.');
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
      return;
    }
  }

  // ── Hold if recipient on suppression list ────────────
  if (!queuedMessage.manual) {
    const suppression = msgDb.query(`SELECT * FROM suppressions WHERE type = 'recipient' AND address = ?`, [message.rcpt_to]) as any[];
    if (suppression && suppression.length > 0) {
      insertDelivery(msgDb, message.id, 'Held', `Recipient (${message.rcpt_to}) is on the suppression list`);
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
      return;
    }
  }

  // ── Load server info ─────────────────────────────────
  const server = mainDb.query(`SELECT * FROM servers WHERE id = ?`).get(queuedMessage.server_id) as any;

  // ── Parse content (link rewriting, tracking pixel) ────
  if (!message.parsed && server) {
    const rawMsgForParse = store.getRawMessage(message);
    if (rawMsgForParse) {
      try {
        const trackDomainRow = message.domain_id ? mainDb.query(
          `SELECT td.*, d.name as domain_name FROM track_domains td JOIN domains d ON d.id = td.domain_id WHERE td.domain_id = ? AND td.server_id = ?`,
        ).get(message.domain_id, queuedMessage.server_id) as any : null;

        if (trackDomainRow) {
          const { MessageParser, LinkStore } = await import('@posta/message-db');
          const config = {
            domain: trackDomainRow.domain_name,
            full_name: `${trackDomainRow.name}.${trackDomainRow.domain_name}`,
            ssl_enabled: !!trackDomainRow.ssl_enabled,
            track_clicks: !!trackDomainRow.track_clicks,
            track_loads: !!trackDomainRow.track_loads,
            excluded_click_domains: trackDomainRow.excluded_click_domains
              ? trackDomainRow.excluded_click_domains.split('\n').map((s: string) => s.trim())
              : [],
            server_token: server.token ?? '',
            message_token: message.token ?? '',
          };
          const linkStore = new LinkStore(msgDb);
          const parser = new MessageParser(config, { createLink: (url: string) => Promise.resolve(linkStore.create(message.id, url)) });
          const modified = await parser.parse(rawMsgForParse);
          if (parser.isActioned()) {
            const sep = modified.search(/\r?\n\r?\n/);
            const newHeaders = sep >= 0 ? modified.slice(0, sep) : modified;
            const newBody = sep >= 0 ? modified.slice(sep + modified.slice(sep, sep + 4).length) : '';
            if (message.raw_table && message.raw_headers_id) {
              msgDb.db.prepare(`UPDATE "${message.raw_table}" SET data = ? WHERE id = ?`).run(newHeaders, message.raw_headers_id);
            }
            if (message.raw_table && message.raw_body_id) {
              msgDb.db.prepare(`UPDATE "${message.raw_table}" SET data = ? WHERE id = ?`).run(newBody, message.raw_body_id);
            }
            msgDb.run(
              `UPDATE messages SET parsed = 1, tracked_links = ?, tracked_images = ? WHERE id = ?`,
              [parser.tracked_links, parser.tracked_images, message.id],
            );
            message.parsed = 1;
          } else {
            msgDb.run(`UPDATE messages SET parsed = 1 WHERE id = ?`, [message.id]);
            message.parsed = 1;
          }
        }
      } catch (err: any) {
        console.log(`[worker] outgoing msg ${message.id}: content parsing error: ${err.message}`);
      }
    }
  }

  // ── Inspect message for spam (outbound) ──────────────
  if (!message.inspected && server?.outbound_spam_threshold) {
    await inspectMessage(config, msgDb, message, 'outgoing', queuedMessage.server_id);
    const updated = msgDb.query(`SELECT spam_score, spam FROM messages WHERE id = ?`, [message.id]) as any[];
    if (updated[0]?.spam && updated[0]?.spam_score >= server.outbound_spam_threshold) {
      insertDelivery(msgDb, message.id, 'HardFail',
        `Message is likely spam. Threshold is ${server.outbound_spam_threshold} and the message scored ${updated[0].spam_score}.`);
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
      return;
    }
  }

  // ── Check send limits ────────────────────────────────
  if (server?.send_limit) {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const todayTs = today.toISOString();
    const count = mainDb.query(`SELECT COUNT(*) as c FROM queued_messages WHERE server_id = ? AND created_at >= ?`).get(queuedMessage.server_id, todayTs) as any;
    const sentToday = count?.c ?? 0;
    if (sentToday >= server.send_limit) {
      mainDb.run(`UPDATE servers SET send_limit_exceeded_at = datetime('now'), send_limit_approaching_at = NULL WHERE id = ?`, [queuedMessage.server_id]);
      insertDelivery(msgDb, message.id, 'Held', `Message held because send limit (${server.send_limit}) has been reached.`);
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
      return;
    } else if (sentToday >= server.send_limit * 0.9) {
      mainDb.run(`UPDATE servers SET send_limit_approaching_at = datetime('now'), send_limit_exceeded_at = NULL WHERE id = ?`, [queuedMessage.server_id]);
    }
  }

  try {
    // ── Load raw message from partitioned storage ─────────
    let rawMessage: string;
    try {
      rawMessage = store.getRawMessage(message);
    } catch {
      // Fallback if raw_message column exists directly
      rawMessage = message.raw_message ?? '';
    }

    if (!rawMessage) {
      await recordFinalFailure(mainDb, queuedMessage, FailureReason.HardFail,
        'No raw message content', attemptNum, startTime);
      return;
    }

    // ── Resolve source IP from IP pool ──────────────────
    let sourceIp = '127.0.0.1';
    if (queuedMessage.ip_address_id) {
      try {
        const ipRow = mainDb.query(
          `SELECT COALESCE(ipv4, ipv6) as ip FROM ip_addresses WHERE id = ?`,
        ).get(queuedMessage.ip_address_id) as any;
        if (ipRow?.ip) sourceIp = ipRow.ip;
      } catch {}
    }

    // ── Enrich with Received header ───────────────────────
    const receivedHeader = generateReceivedHeader(
      config.posta.web_hostname,
      sourceIp,
      'HTTP',
    );
    rawMessage = `${receivedHeader}\r\n${rawMessage}`;

    // ── Optionally sign with DKIM ─────────────────────────
    // If the domain has a DKIM key configured, sign the message
    try {
      rawMessage = await signWithDkim(config, message, rawMessage);
    } catch {
      // DKIM signing is best-effort
    }

    // ── Send via SMTP ─────────────────────────────────────
    const { SmtpSender } = await import('@posta/smtp-client');
    const sender = new SmtpSender({
      heloHostname: config.posta.web_hostname,
      openTimeout: config.smtp_client.open_timeout,
      readTimeout: config.smtp_client.read_timeout,
      smtpRelays: config.posta.smtp_relays,
      sourceIpAddress: sourceIp === '127.0.0.1' ? undefined : sourceIp,
    });

    const result = await sender.send(
      rawMessage,
      message.mail_from ?? '',
      message.rcpt_to,
    );

    const deliveryStatus = result.classification;
    const duration = Date.now() - startTime;

    // ── Record delivery attempt ───────────────────────────
    msgDb.insert('deliveries', {
      message_id: message.id,
      status: deliveryStatus,
      details: result.error ?? (deliveryStatus === 'Sent' ? 'Message sent successfully' : 'Delivery failed'),
      timestamp: Date.now() / 1000,
      time: Math.floor(duration / 1000),
    });

    msgDb.update('messages', {
      status: deliveryStatus,
      last_delivery_attempt: Date.now() / 1000,
    }, { where: { id: message.id } });

    // Live stats
    msgDb.exec(
      `INSERT INTO live_stats (type, minute, count, timestamp) VALUES ('outgoing', ${new Date().getUTCMinutes()}, 1, ${Date.now() / 1000}) ` +
      `ON CONFLICT(minute, type) DO UPDATE SET count = count + 1, timestamp = ${Date.now() / 1000}`,
    );

    if (deliveryStatus === 'Sent') {
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
    } else if (deliveryStatus === 'HardFail') {
      await recordFinalFailure(mainDb, queuedMessage, FailureReason.HardFail,
        result.error ?? 'Hard fail', attemptNum, startTime);
    } else {
      await handleRetry(mainDb, queuedMessage, FailureReason.SoftFail,
        result.error ?? 'Soft fail', attemptNum, startTime, locker);
    }
  } catch (err: any) {
    console.error(`[worker] outgoing delivery error for msg ${message.id}:`, err.message);
    await handleRetry(mainDb, queuedMessage, FailureReason.Timeout,
      err.message, attemptNum, startTime, locker);
  }
}

/**
 * Optionally sign a message with DKIM if the domain has a signing key.
 */
async function signWithDkim(
  config: PostaConfig,
  message: any,
  rawMessage: string,
): Promise<string> {
  // Domain ID is optional — if not set, we can't look up the key
  if (!message.domain_id) return rawMessage;

  const mainDb = getMainDb(config);

  // Look up domain's DKIM private key
  const domain = mainDb.query(
    `SELECT dkim_private_key, name FROM domains WHERE id = ?`,
  ).get(message.domain_id) as { dkim_private_key: string | null; name: string } | undefined;

  if (!domain?.dkim_private_key) return rawMessage;

  const { DkimHeader } = await import('@posta/core');
  const dkim = new DkimHeader(
    domain.name,
    domain.dkim_private_key,
    config.dns.dkim_identifier,
    rawMessage,
  );
  const dkimHeader = await dkim.generate();

  return `${dkimHeader}\r\n${rawMessage}`;
}

/**
 * Generate a Received header for tracking delivery path.
 * RFC 5321 section 4.4.
 */
function generateReceivedHeader(
  fromHelo: string,
  fromIp: string,
  method: string,
): string {
  const now = new Date().toUTCString();
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return [
    `Received: from ${fromHelo} ([${fromIp}])`,
    `\tby posta (${method}) with ${method === 'SMTP' ? 'ESMTP' : 'HTTP'}`,
    `\tid ${id}`,
    `\tfor <recipient>; ${now}`,
  ].join('\r\n');
}

// ─── Incoming Message Processing ──────────────────────────

/**
 * Process incoming message — full pipeline mirroring Ruby IncomingMessageProcessor.
 *
 * Steps:
 *  1. Handle bounces — link to original outgoing messages
 *  2. Increment live stats
 *  3. Inspect message (spam/virus via Rspamd/ClamAV)
 *  4. Fail if spam score exceeds failure threshold
 *  5. Hold if server in development mode
 *  6. Find route for the message's domain
 *  7. Hold or reject spam based on route spam_mode
 *  8. Accept without endpoints (route.mode == 'Accept')
 *  9. Hold messages (route.mode == 'Hold')
 * 10. Bounce/Reject (route.mode == 'Bounce' or 'Reject')
 * 11. Send message to endpoint (HTTP/SMTP/Address)
 * 12. Send bounce on hard fail
 * 13. Finish processing (retry if needed, mark endpoint as used)
 */
async function processIncoming(
  config: PostaConfig,
  msgDb: any,
  store: MessageStore,
  queuedMessage: any,
  message: any,
  locker: string,
  attemptNum: number,
  startTime: number,
): Promise<void> {
  const mainDb = getMainDb(config);

  try {
    // Look up the server for this message
    const server = mainDb.query(
      `SELECT * FROM servers WHERE id = ?`,
    ).get(queuedMessage.server_id) as any;

    if (!server) {
      insertDelivery(msgDb, message.id, 'HardFail', 'Server not found');
      await recordFinalFailure(mainDb, queuedMessage, FailureReason.HardFail,
        'Server not found', attemptNum, startTime);
      return;
    }

    // ── Step 1: Handle bounces ──────────────────────────────
    if (message.bounce) {
      console.log(`[worker] incoming msg ${message.id}: message is a bounce`);

      // Look for original outgoing messages that this bounce relates to.
      // The bounce_for_id may already be set by the SMTP server when linking
      // the return path, or we look up by matching outgoing messages.
      const originalMessages = findOriginalMessages(msgDb, message);

      if (originalMessages.length > 0) {
        for (const origMsg of originalMessages) {
          // Link the bounce to the original message
          msgDb.run(
            `UPDATE messages SET bounce_for_id = ?, domain_id = ? WHERE id = ?`,
            [origMsg.id, origMsg.domain_id, message.id],
          );

          insertDelivery(msgDb, message.id, 'Processed',
            `This has been detected as a bounce message for <msg:${origMsg.id}>.`);

          // Mark the original message as bounced
          msgDb.run(
            `UPDATE messages SET status = 'Bounced' WHERE id = ?`,
            [origMsg.id],
          );

          console.log(`[worker] bounce linked with message ${origMsg.id}`);
        }

        mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
        return;
      }

      // No original messages found — if there's no route_id, hard fail
      if (!message.route_id) {
        console.log(`[worker] incoming msg ${message.id}: no source messages found, hard failing`);
        insertDelivery(msgDb, message.id, 'HardFail',
          "This message was a bounce but we couldn't link it with any outgoing message and there was no route for it.");
        mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
        return;
      }

      // Otherwise, continue processing — the bounce will be routed normally
    }

    // ── Step 2: Increment live stats ────────────────────────
    incrementLiveStats(msgDb, message.scope ?? 'incoming');

    // ── Step 3: Inspect message (spam/virus) ────────────────
    await inspectMessage(config, msgDb, message, 'incoming', queuedMessage.server_id);

    // ── Step 4: Fail if spam score exceeds failure threshold ─
    const spamFailureThreshold = server.spam_failure_threshold
      ?? config.posta.default_spam_failure_threshold;

    if (message.spam_score >= spamFailureThreshold) {
      console.log(`[worker] incoming msg ${message.id}: spam score ${message.spam_score} exceeds failure threshold ${spamFailureThreshold}`);
      insertDelivery(msgDb, message.id, 'HardFail',
        `Message's spam score is higher than the failure threshold for this server. Threshold is currently ${spamFailureThreshold}.`);
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
      return;
    }

    // ── Step 5: Hold if server in development mode ──────────
    if (!queuedMessage.manual && server.mode === 'Development') {
      console.log(`[worker] incoming msg ${message.id}: server is in development mode, holding`);
      insertDelivery(msgDb, message.id, 'Held', 'Server is in development mode.');
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
      return;
    }

    // ── Step 6: Find route ──────────────────────────────────
    let route: any = null;

    if (message.route_id) {
      route = mainDb.query(
        `SELECT * FROM routes WHERE id = ?`,
      ).get(message.route_id) as any;
    }

    if (!route && message.domain_id) {
      route = mainDb.query(
        `SELECT * FROM routes WHERE domain_id = ? AND server_id = ?`,
      ).get(message.domain_id, queuedMessage.server_id) as any;
    }

    if (!route) {
      console.log(`[worker] incoming msg ${message.id}: no route found, hard failing`);
      insertDelivery(msgDb, message.id, 'HardFail',
        'Message does not have a route and/or endpoint available for delivery.');
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
      return;
    }

    // ── Step 7: Hold or reject spam based on route spam_mode ─
    if (message.spam && !queuedMessage.manual) {
      if (route.spam_mode === 'Quarantine') {
        console.log(`[worker] incoming msg ${message.id}: spam quarantined by route`);
        insertDelivery(msgDb, message.id, 'Held', 'Message placed into quarantine.');
        mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
        return;
      } else if (route.spam_mode === 'Fail') {
        console.log(`[worker] incoming msg ${message.id}: spam failed by route`);
        insertDelivery(msgDb, message.id, 'HardFail',
          'Message is spam and the route specified it should be failed.');
        mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
        return;
      }
    }

    // ── Step 8: Accept without endpoints (route.mode == 'Accept') ─
    if (route.mode === 'Accept') {
      console.log(`[worker] incoming msg ${message.id}: route says accept without endpoint`);
      insertDelivery(msgDb, message.id, 'Processed',
        'Message has been accepted but not sent to any endpoints.');
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
      return;
    }

    // ── Step 9: Hold messages (route.mode == 'Hold') ────────
    if (route.mode === 'Hold') {
      if (queuedMessage.manual) {
        console.log(`[worker] incoming msg ${message.id}: route says hold but queued manually, processing`);
        insertDelivery(msgDb, message.id, 'Processed', 'Message has been processed.');
      } else {
        console.log(`[worker] incoming msg ${message.id}: route says hold`);
        insertDelivery(msgDb, message.id, 'Held',
          'Message has been accepted but not sent to any endpoints.');
      }
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
      return;
    }

    // ── Step 10: Bounce/Reject (route.mode == 'Bounce' or 'Reject') ─
    if (route.mode === 'Bounce' || route.mode === 'Reject') {
      console.log(`[worker] incoming msg ${message.id}: route says bounce/reject`);

      let bounceDetails = 'Message has been bounced because the route asks for this.';

      // Generate and send a bounce DSN
      const bounceId = await sendBounce(config, server, message, store, route);
      if (bounceId) {
        bounceDetails += ` See message <msg:${bounceId}>.`;
        console.log(`[worker] bounce sent with id ${bounceId}`);
      }

      insertDelivery(msgDb, message.id, 'HardFail', bounceDetails);
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
      return;
    }

    // ── Step 11: Send message to endpoint ───────────────────
    const endpointType = route.endpoint_type;
    const endpointId = route.endpoint_id;

    if (!endpointType || !endpointId) {
      console.log(`[worker] incoming msg ${message.id}: invalid endpoint for route`);
      insertDelivery(msgDb, message.id, 'HardFail', 'Invalid endpoint for route.');
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
      return;
    }

    // Load the raw message for sending
    let rawMessage: string;
    try {
      rawMessage = store.getRawMessage(message);
    } catch {
      rawMessage = message.raw_message ?? '';
    }

    if (!rawMessage) {
      insertDelivery(msgDb, message.id, 'HardFail', 'No raw message content available for delivery.');
      await recordFinalFailure(mainDb, queuedMessage, FailureReason.HardFail,
        'No raw message content', attemptNum, startTime);
      return;
    }

    let sendResult: SendResult;

    if (endpointType === 'HTTPEndpoint') {
      sendResult = await sendToHttpEndpoint(config, msgDb, mainDb, message, rawMessage, endpointId);
    } else if (endpointType === 'SMTPEndpoint') {
      sendResult = await sendToSmtpEndpoint(config, mainDb, message, rawMessage, endpointId);
    } else if (endpointType === 'AddressEndpoint') {
      sendResult = await sendToAddressEndpoint(config, mainDb, message, rawMessage, endpointId);
    } else {
      console.log(`[worker] incoming msg ${message.id}: invalid endpoint type ${endpointType}`);
      insertDelivery(msgDb, message.id, 'HardFail', `Invalid endpoint type: ${endpointType}`);
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
      return;
    }

    // ── Step 12: Send bounce on hard fail ───────────────────
    let additionalDetails = '';
    if (sendResult.classification === 'HardFail' && !sendResult.suppressBounce) {
      // Only send bounces for messages that can receive them (non-empty mail_from)
      if (message.mail_from && message.mail_from !== '' && message.mail_from !== '<>') {
        console.log(`[worker] incoming msg ${message.id}: sending bounce after hard fail`);
        const bounceId = await sendBounce(config, server, message, store, route);
        if (bounceId) {
          additionalDetails = ` Sent bounce message to sender (see message <msg:${bounceId}>).`;
          console.log(`[worker] bounce sent with id ${bounceId}`);
        }
      }
    }

    // ── Step 13: Finish processing ──────────────────────────
    const duration = Date.now() - startTime;

    // Record the delivery
    insertDelivery(msgDb, message.id, sendResult.classification,
      (sendResult.details ?? '') + additionalDetails, duration);

    // Update message status
    msgDb.run(
      `UPDATE messages SET status = ?, last_delivery_attempt = ?, endpoint_id = ?, endpoint_type = ? WHERE id = ?`,
      [sendResult.classification, Date.now() / 1000, endpointId, endpointType, message.id],
    );

    // Mark endpoint as used
    markEndpointAsUsed(mainDb, endpointType, endpointId);

    if (sendResult.retry) {
      // Retry later
      console.log(`[worker] incoming msg ${message.id}: retrying later`);
      await handleRetry(mainDb, queuedMessage, FailureReason.SoftFail,
        sendResult.details ?? 'Retry requested', attemptNum, startTime, locker);
      return;
    }

    if (sendResult.classification === 'HardFail') {
      await recordFinalFailure(mainDb, queuedMessage, FailureReason.HardFail,
        sendResult.details ?? 'Hard fail', attemptNum, startTime);
    } else if (sendResult.classification === 'SoftFail') {
      await handleRetry(mainDb, queuedMessage, FailureReason.SoftFail,
        sendResult.details ?? 'Soft fail', attemptNum, startTime, locker);
    } else {
      // Success — remove from queue
      console.log(`[worker] incoming msg ${message.id}: processing completed`);
      mainDb.run(`DELETE FROM queued_messages WHERE id = ?`, [queuedMessage.id]);
    }
  } catch (err: any) {
    console.error(`[worker] incoming processing error for msg ${message.id}:`, err.message);
    await handleRetry(mainDb, queuedMessage, FailureReason.Unknown,
      err.message, attemptNum, startTime, locker);
  }
}

// ─── Incoming Helper: Find original messages for a bounce ──

/**
 * Find original outgoing messages that a bounce relates to.
 *
 * In the Ruby codebase, `original_messages` is a model association that
 * links bounce messages to their originals via the return path. Here we
 * look for outgoing messages where:
 * - The bounce's bounce_for_id is already set, OR
 * - The bounce's rcpt_to (return path) matches an outgoing message's mail_from
 */
function findOriginalMessages(msgDb: any, message: any): any[] {
  // If bounce_for_id is already set, look up that specific message
  if (message.bounce_for_id && message.bounce_for_id > 0) {
    const rows = msgDb.query(
      `SELECT * FROM messages WHERE id = ? AND scope = 'outgoing'`,
      [message.bounce_for_id],
    ) as any[];
    return Array.isArray(rows) ? rows : [];
  }

  // Try to find outgoing messages whose return path matches this bounce's rcpt_to
  if (message.rcpt_to) {
    const rows = msgDb.query(
      `SELECT * FROM messages WHERE scope = 'outgoing' AND mail_from = ? LIMIT 10`,
      [message.rcpt_to],
    ) as any[];
    return Array.isArray(rows) ? rows : [];
  }

  return [];
}

// ─── Incoming Helper: Insert delivery record ─────────────

/**
 * Insert a delivery record into the server's MessageDB.
 */
function insertDelivery(
  msgDb: any,
  messageId: number,
  status: string,
  details: string,
  durationMs?: number,
): void {
  msgDb.insert('deliveries', {
    message_id: messageId,
    status,
    details,
    timestamp: Date.now() / 1000,
    time: durationMs != null ? Math.floor(durationMs / 1000) : undefined,
  });
}

// ─── Incoming Helper: Increment live stats ─────────────────

/**
 * Increment the live_stats counter for the given message type.
 */
function incrementLiveStats(msgDb: any, type: string): void {
  const minute = new Date().getUTCMinutes();
  const ts = Date.now() / 1000;
  msgDb.exec(
    `INSERT INTO live_stats (type, minute, count, timestamp) VALUES ('${type}', ${minute}, 1, ${ts}) ` +
    `ON CONFLICT(minute, type) DO UPDATE SET count = count + 1, timestamp = ${ts}`,
  );
}

// ─── Incoming Helper: Inspect message (spam/virus) ─────────

/**
 * Run spam and virus inspections on a message.
 *
 * Updates the message record with spam_score, spam, threat, and threat_details.
 * Stores individual spam checks in the spam_checks table.
 *
 * Mirrors the Ruby `inspect_message` method which delegates to configured
 * inspectors (Rspamd for spam, ClamAV for viruses).
 */
async function inspectMessage(
  config: PostaConfig,
  msgDb: any,
  message: any,
  scope: 'incoming' | 'outgoing',
  serverId: number,
): Promise<void> {
  // Skip if already inspected
  if (message.inspected) return;

  console.log(`[worker] inspecting message ${message.id}`);

  let spamScore = 0;
  let isSpam = false;
  let isThreat = false;
  let threatDetails: string | null = null;

  // Load the raw message for inspection
  let rawMessage: string;
  try {
    const store = new MessageStore(msgDb);
    rawMessage = store.getRawMessage(message);
  } catch {
    rawMessage = message.raw_message ?? '';
  }

  if (!rawMessage) {
    console.log(`[worker] no raw message for inspection, skipping`);
    return;
  }

  // Look up the server for spam thresholds
  const mainDb = getMainDb(config);
  const server = mainDb.query(
    `SELECT spam_threshold FROM servers WHERE id = ?`,
  ).get(serverId) as { spam_threshold: number | null } | undefined;

  const spamThreshold = server?.spam_threshold ?? config.posta.default_spam_threshold;

  // ── Rspamd spam check ───────────────────────────────────
  if (config.rspamd?.enabled) {
    try {
      const result = await checkWithRspamd(
        {
          host: config.rspamd.host,
          port: config.rspamd.port,
          ssl: config.rspamd.ssl,
          password: config.rspamd.password,
          flags: config.rspamd.flags,
        },
        rawMessage,
        scope,
        message.rcpt_to ?? '',
        message.mail_from ?? '',
        message.token ?? '',
      );

      if (result.error) {
        console.log(`[worker] rspamd error: ${result.error}`);
      }

      for (const check of result.checks) {
        spamScore += check.score;

        // Store each check in the spam_checks table
        msgDb.insert('spam_checks', {
          message_id: message.id,
          score: check.score,
          code: check.name,
          description: check.description,
        });
      }
    } catch (err: any) {
      console.log(`[worker] rspamd inspection failed: ${err.message}`);
    }
  }

  // ── SpamAssassin spam check ──────────────────────────────
  if (config.spamd?.enabled) {
    try {
      const result = await checkWithSpamAssassin(
        { host: config.spamd.host, port: config.spamd.port },
        rawMessage,
        scope,
      );

      if (result.error) {
        console.log(`[worker] spamd error: ${result.error}`);
      }

      for (const check of result.checks) {
        spamScore += check.score;
        msgDb.insert('spam_checks', {
          message_id: message.id,
          score: check.score,
          code: check.name,
          description: check.description,
        });
      }
    } catch (err: any) {
      console.log(`[worker] spamd inspection failed: ${err.message}`);
    }
  }

  // ── ClamAV virus scan ───────────────────────────────────
  if (config.clamav?.enabled) {
    try {
      const result = await scanWithClamav(
        {
          host: config.clamav.host,
          port: config.clamav.port,
        },
        rawMessage,
      );

      if (result.threat) {
        isThreat = true;
        threatDetails = result.message;
        console.log(`[worker] threat detected: ${result.message}`);
      }
    } catch (err: any) {
      console.log(`[worker] clamav inspection failed: ${err.message}`);
    }
  }

  // Determine if spam
  if (spamScore > spamThreshold) {
    isSpam = true;
    console.log(`[worker] message ${message.id} is spam (scored ${spamScore}, threshold is ${spamThreshold})`);
  }

  // Update the message record with inspection results
  msgDb.run(
    `UPDATE messages SET inspected = 1, spam_score = ?, spam = ?, threat = ?, threat_details = ? WHERE id = ?`,
    [spamScore, isSpam ? 1 : 0, isThreat ? 1 : 0, threatDetails, message.id],
  );

  // Update the in-memory message object for subsequent steps
  message.inspected = 1;
  message.spam_score = spamScore;
  message.spam = isSpam ? 1 : 0;
  message.threat = isThreat ? 1 : 0;
  message.threat_details = threatDetails;

  console.log(`[worker] message ${message.id} inspected: spam=${isSpam}, score=${spamScore}, threat=${isThreat}`);
}

// ─── Incoming Helper: Send bounce DSN ──────────────────────

/**
 * Generate and queue a bounce (DSN) message for the given failed message.
 * Returns the new bounce message ID, or null if bounce generation failed.
 */
async function sendBounce(
  config: PostaConfig,
  server: any,
  message: any,
  store: MessageStore,
  route: any,
): Promise<number | null> {
  // Don't send bounces to empty return paths (already a bounce)
  if (!message.mail_from || message.mail_from === '' || message.mail_from === '<>') {
    return null;
  }

  try {
    const provisioner = new (await import('@posta/message-db')).MessageDbProvisioner(config);
    const bounceProcessor = new BounceProcessor(config, provisioner);

    // Load the raw message to attach to the bounce
    let rawMessage: string;
    try {
      rawMessage = store.getRawMessage(message);
    } catch {
      rawMessage = message.raw_message ?? '';
    }

    const routeDescription = route.name
      ? `${route.name} (${route.endpoint_type ?? 'unknown'})`
      : `route #${route.id}`;

    const bounceId = await bounceProcessor.processBounce({
      serverId: server.id,
      messageId: message.id,
      mailFrom: message.mail_from ?? '',
      rcptTo: message.rcpt_to ?? '',
      subject: message.subject ?? '(no subject)',
      token: message.token ?? '',
      messageId_header: message.message_id ?? '',
      routeDescription,
      rawMessage,
    });

    return bounceId;
  } catch (err: any) {
    console.error(`[worker] bounce generation failed: ${err.message}`);
    return null;
  }
}

// ─── Incoming Helper: Send result type ─────────────────────

interface SendResult {
  classification: 'Sent' | 'SoftFail' | 'HardFail';
  details?: string;
  retry?: boolean;
  suppressBounce?: boolean;
  connectError?: boolean;
}

// ─── Incoming Helper: Send to HTTP endpoint ────────────────

async function sendToHttpEndpoint(
  config: PostaConfig,
  msgDb: any,
  mainDb: any,
  message: any,
  rawMessage: string,
  endpointId: number,
): Promise<SendResult> {
  const endpoint = mainDb.query(
    `SELECT * FROM http_endpoints WHERE id = ?`,
  ).get(endpointId) as any;

  if (!endpoint) {
    return {
      classification: 'HardFail',
      details: `HTTP endpoint #${endpointId} not found.`,
    };
  }

  try {
    const { HttpSender } = await import('@posta/smtp-client');
    const sender = new HttpSender(endpoint);

    const httpMessage = {
      id: message.id,
      rcpt_to: message.rcpt_to ?? '',
      mail_from: message.mail_from ?? '',
      token: message.token ?? '',
      subject: message.subject ?? '',
      message_id: message.message_id ?? '',
      timestamp: message.timestamp ?? Date.now() / 1000,
      size: message.size ?? '0',
      spam_status: message.spam ? 'spam' : 'not_spam',
      bounce: !!message.bounce,
      received_with_ssl: !!message.received_with_ssl,
      raw_message: rawMessage,
    };

    const result = await sender.sendMessage(httpMessage);

    return {
      classification: result.classification,
      details: result.details,
      retry: result.retry,
      suppressBounce: result.suppressBounce,
      connectError: result.connectError,
    };
  } catch (err: any) {
    return {
      classification: 'SoftFail',
      details: `HTTP delivery error: ${err.message}`,
      retry: true,
    };
  }
}

// ─── Incoming Helper: Send to SMTP endpoint ────────────────

async function sendToSmtpEndpoint(
  config: PostaConfig,
  mainDb: any,
  message: any,
  rawMessage: string,
  endpointId: number,
): Promise<SendResult> {
  const endpoint = mainDb.query(
    `SELECT * FROM smtp_endpoints WHERE id = ?`,
  ).get(endpointId) as any;

  if (!endpoint) {
    return {
      classification: 'HardFail',
      details: `SMTP endpoint #${endpointId} not found.`,
    };
  }

  if (!endpoint.hostname) {
    return {
      classification: 'HardFail',
      details: `SMTP endpoint #${endpointId} has no hostname configured.`,
    };
  }

  try {
    const { SmtpSender } = await import('@posta/smtp-client');
    const sender = new SmtpSender({
      heloHostname: config.posta.web_hostname,
      openTimeout: config.smtp_client.open_timeout,
      readTimeout: config.smtp_client.read_timeout,
    });

    // For SMTP endpoints, we deliver to the endpoint's hostname
    // The rcpt_to is the endpoint's hostname (acting as the recipient domain)
    const rcptTo = message.rcpt_to ?? '';
    const mailFrom = message.mail_from ?? '';

    const result = await sender.send(rawMessage, mailFrom, rcptTo);

    return {
      classification: result.classification,
      details: result.error ?? (result.classification === 'Sent' ? 'Message delivered to SMTP endpoint.' : 'Delivery failed'),
      retry: result.classification === 'SoftFail',
    };
  } catch (err: any) {
    return {
      classification: 'SoftFail',
      details: `SMTP delivery error: ${err.message}`,
      retry: true,
    };
  }
}

// ─── Incoming Helper: Send to Address endpoint ─────────────

async function sendToAddressEndpoint(
  config: PostaConfig,
  mainDb: any,
  message: any,
  rawMessage: string,
  endpointId: number,
): Promise<SendResult> {
  const endpoint = mainDb.query(
    `SELECT * FROM address_endpoints WHERE id = ?`,
  ).get(endpointId) as any;

  if (!endpoint) {
    return {
      classification: 'HardFail',
      details: `Address endpoint #${endpointId} not found.`,
    };
  }

  if (!endpoint.address) {
    return {
      classification: 'HardFail',
      details: `Address endpoint #${endpointId} has no address configured.`,
    };
  }

  try {
    const { SmtpSender } = await import('@posta/smtp-client');
    const sender = new SmtpSender({
      heloHostname: config.posta.web_hostname,
      openTimeout: config.smtp_client.open_timeout,
      readTimeout: config.smtp_client.read_timeout,
    });

    // For address endpoints, we send to the endpoint's address as the recipient
    const result = await sender.send(
      rawMessage,
      message.mail_from ?? '',
      endpoint.address,
    );

    return {
      classification: result.classification,
      details: result.error ?? (result.classification === 'Sent' ? `Message delivered to ${endpoint.address}.` : 'Delivery failed'),
      retry: result.classification === 'SoftFail',
    };
  } catch (err: any) {
    return {
      classification: 'SoftFail',
      details: `Address endpoint delivery error: ${err.message}`,
      retry: true,
    };
  }
}

// ─── Incoming Helper: Mark endpoint as used ────────────────

/**
 * Update the endpoint's last_used_at timestamp.
 */
function markEndpointAsUsed(mainDb: any, endpointType: string, endpointId: number): void {
  const tableName = endpointType === 'HTTPEndpoint'
    ? 'http_endpoints'
    : endpointType === 'SMTPEndpoint'
      ? 'smtp_endpoints'
      : endpointType === 'AddressEndpoint'
        ? 'address_endpoints'
        : null;

  if (!tableName) return;

  try {
    mainDb.run(
      `UPDATE ${tableName} SET last_used_at = datetime('now') WHERE id = ?`,
      [endpointId],
    );
  } catch {
    // Best-effort — don't fail processing if this update fails
  }
}

// ─── Retry & DLQ helpers ────────────────────────────────

async function handleRetry(
  db: ReturnType<typeof getMainDb>,
  qm: any,
  reason: FailureReasonType,
  error: string | null,
  attempt: number,
  startedAt: number,
  locker: string,
): Promise<void> {
  if (attempt >= (qm.max_attempts ?? MAX_ATTEMPTS)) {
    console.log(`[worker] msg ${qm.id}: max attempts (${MAX_ATTEMPTS}) reached, moving to DLQ. Reason: ${reason}`);
    await recordFinalFailure(db, qm, FailureReason.MaxAttemptsExceeded,
      `Max attempts exceeded. Last error: ${error}`, attempt, startedAt);
    return;
  }

  const delaySec = Math.floor(computeRetryDelay(BackoffStrategy.JITTER, attempt, 30, 300) / 1000);

  db.run(
    `UPDATE queued_messages SET retry_after = datetime('now', '+${delaySec} seconds'), locked_by = NULL, locked_at = NULL WHERE id = ?`,
    [qm.id],
  );
}

async function recordFinalFailure(
  db: ReturnType<typeof getMainDb>,
  qm: any,
  reason: FailureReasonType,
  error: string | null,
  attempt: number,
  startedAt: number,
): Promise<void> {
  try {
    db.run(`
      INSERT OR REPLACE INTO failed_messages (queue_message_id, message_id, server_id, reason, error, attempts, last_attempt_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `, [qm.id, qm.message_id, qm.server_id, reason, error, attempt]);
  } catch {
    console.error(`[worker] DLQ write failed, msg ${qm.id} will be removed silently`);
  }

  db.run(`DELETE FROM queued_messages WHERE id = ?`, [qm.id]);
}

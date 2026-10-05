import { createQueuedMessage, findInboundRoute, getMainDb, getServerDb, parseMessageSummary, type PostaConfig, type Queryable } from '@posta/core';
import { MessageDatabase, MessageDbProvisioner, MessageStore } from '@posta/message-db';
import { InboundRejectedError, SesInboundStore, assertReceiptLocation, parseSesReceipt, type SesReceipt } from '@posta/aws';

interface Target { address: string; domainId: number; routeId: number }
interface ReceiptRow { recipient: string; message_id: number; queued_at: Date | null }

const placeholders = (count: number, from: number) => Array.from({ length: count }, (_, i) => `$${i + from}`).join(', ');

/** What an earlier attempt already stored for these recipients of one SES message. */
function receiptRows(db: Queryable, region: string, sesMessageId: string, addresses: string[]): Promise<ReceiptRow[]> {
  return db.query<ReceiptRow>(
    `SELECT recipient, message_id, queued_at FROM ses_inbound_receipts
     WHERE region = $1 AND ses_message_id = $2 AND recipient IN (${placeholders(addresses.length, 3)})`,
    [region, sesMessageId, ...addresses]);
}

/**
 * Turn one SES receipt into incoming messages, as the SMTP server does for mail it takes:
 * one message row per recipient, in the database of the server whose route claims it.
 *
 * Safe to run again for the same receipt. Each (SES message, recipient) is recorded in the
 * server's own database in the same transaction as its message row, so a retry finds the
 * message instead of storing a second copy, and only completes whatever an earlier attempt
 * left unfinished (the hand-off to the queue lives in the main database, so it can lag).
 */
export async function ingestSesReceipt(config: PostaConfig, topicArn: string, receipt: SesReceipt,
  store = new SesInboundStore(config)): Promise<{ stored: number; skipped: number }> {
  const region = topicArn.split(':')[3];
  assertReceiptLocation(config, region, receipt);
  const mainDb = getMainDb(config);

  // The same rules as the SMTP server's RCPT TO, plus: only the region a domain names may deliver for it.
  const byServer = new Map<number, Target[]>();
  let skipped = 0;
  for (const address of receipt.recipients) {
    const route = await findInboundRoute(mainDb, address);
    if (!route || route.ses_inbound_region !== region) { skipped++; continue; }
    byServer.set(route.server_id, [...(byServer.get(route.server_id) ?? []),
      { address, domainId: route.domain_id, routeId: route.id }]);
  }

  const provisioner = new MessageDbProvisioner(config);
  const toQueue: { serverId: number; messageId: number; domainId: number; address: string }[] = [];
  let raw: string | null = null;
  let stored = 0;

  for (const [serverId, targets] of byServer) {
    const serverDb = getServerDb(config, serverId);
    await provisioner.openServerDb(serverId, serverDb);
    const addresses = targets.map((t) => t.address);

    // Nothing to store when an earlier attempt already did: skip the fetch from S3 entirely.
    if ((await receiptRows(serverDb, region, receipt.messageId, addresses)).length < targets.length) {
      raw ??= await store.fetch(region, receipt);
      const body = raw;
      const summary = parseMessageSummary(body);
      await serverDb.transaction(async (tx) => {
        // Two copies of one notification must not both store the message.
        await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`ses-inbound:${region}:${receipt.messageId}`]);
        const done = new Set((await receiptRows(tx, region, receipt.messageId, addresses)).map((r) => r.recipient));
        const fresh = targets.filter((t) => !done.has(t.address));
        if (!fresh.length) return;

        const txDb = new MessageDatabase(tx, serverId);
        const messages = new MessageStore(txDb);
        const rawRow = await messages.insertRawMessage(body);
        const virus = receipt.virus === 'FAIL';
        for (const target of fresh) {
          const id = await messages.create({
            scope: 'incoming',
            rcpt_to: target.address,
            mail_from: receipt.source,
            subject: summary.subject,
            message_id: summary.messageId,
            timestamp: Date.parse(receipt.timestamp) / 1000,
            raw_table: rawRow.tableName,
            raw_headers_id: rawRow.headersId,
            raw_body_id: rawRow.bodyId,
            domain_id: target.domainId,
            route_id: target.routeId,
            status: 'Pending',
            bounce: false,
            ...(virus ? { threat: true, threat_details: 'Amazon SES virus scan flagged this message' } : {}),
          });
          // SES's spam verdict becomes one more spam check, weighed with Rspamd's and SpamAssassin's.
          if (receipt.spam === 'FAIL') {
            await txDb.insert('spam_checks', {
              message_id: id, score: (config.posta.default_spam_threshold ?? 5) + 1,
              code: 'SES_SPAM_VERDICT', description: 'Amazon SES flagged this message as spam',
            });
          }
          await tx.run(`INSERT INTO ses_inbound_receipts (region, ses_message_id, recipient, message_id) VALUES ($1, $2, $3, $4)`,
            [region, receipt.messageId, target.address, id]);
          stored++;
        }
      });
    }

    // Queue everything stored here whose hand-off is not recorded, including an earlier attempt's.
    for (const row of await receiptRows(serverDb, region, receipt.messageId, addresses)) {
      if (row.queued_at) continue;
      const target = targets.find((t) => t.address === row.recipient)!;
      toQueue.push({ serverId, messageId: Number(row.message_id), domainId: target.domainId, address: row.recipient });
    }
  }

  for (const item of toQueue) {
    const serverDb = getServerDb(config, item.serverId);
    const message = await serverDb.get<{ status: string }>(`SELECT status FROM messages WHERE id = $1`, [item.messageId]);
    const queued = await mainDb.get(`SELECT 1 FROM queued_messages WHERE server_id = $1 AND message_id = $2`, [item.serverId, item.messageId]);
    // A message that already left Pending was handled by an earlier attempt that died before recording it.
    if (message?.status === 'Pending' && !queued) {
      await createQueuedMessage(mainDb, { serverId: item.serverId, messageId: item.messageId, domainId: item.domainId });
    }
    await serverDb.run(`UPDATE ses_inbound_receipts SET queued_at = NOW()
      WHERE region = $1 AND ses_message_id = $2 AND recipient = $3`, [region, receipt.messageId, item.address]);
  }

  await store.remove(region, receipt);
  return { stored, skipped };
}

/** Claims one received message, so S3 is read and the database written outside any long-held lock. */
export async function processSesInboundJob(config: PostaConfig, store?: SesInboundStore): Promise<boolean> {
  const mainDb = getMainDb(config);
  // The lease makes a crashed worker's claim expire, after which another worker retries it.
  const row = await mainDb.get<any>(`UPDATE ses_event_inbox SET attempts = attempts + 1, retry_after = NOW() + INTERVAL '5 minutes'
    WHERE (topic_arn, sns_message_id) = (
      SELECT topic_arn, sns_message_id FROM ses_event_inbox
      WHERE kind = 'inbound' AND processed_at IS NULL AND (retry_after IS NULL OR retry_after <= NOW())
      ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING *`);
  if (!row) return false;
  const key = [row.topic_arn, row.sns_message_id];
  try {
    const receipt = parseSesReceipt(typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload);
    if (!receipt) throw new InboundRejectedError('Invalid stored SES receipt');
    await ingestSesReceipt(config, row.topic_arn, receipt, store);
    await mainDb.run(`UPDATE ses_event_inbox SET processed_at = NOW(), error = NULL WHERE topic_arn = $1 AND sns_message_id = $2`, key);
  } catch (error: any) {
    if (error instanceof InboundRejectedError) {
      // Retrying cannot make a forged or vanished object valid.
      await mainDb.run(`UPDATE ses_event_inbox SET processed_at = NOW(), error = $3 WHERE topic_arn = $1 AND sns_message_id = $2`, [...key, error.message]);
      console.warn(`[ses-inbound] Dropped ${row.sns_message_id}: ${error.message}`);
    } else {
      await mainDb.run(`UPDATE ses_event_inbox SET error = $3, retry_after = NOW() + LEAST(attempts * 30, 600) * INTERVAL '1 second'
        WHERE topic_arn = $1 AND sns_message_id = $2`, [...key, error.message]);
      console.warn(`[ses-inbound] ${row.sns_message_id} will retry: ${error.message}`);
    }
  }
  return true;
}

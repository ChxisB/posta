import { SQSClient, ReceiveMessageCommand, DeleteMessageBatchCommand, type Message } from '@aws-sdk/client-sqs';
import { getMainDb, getServerDb, type PostaConfig, type Queryable } from '@posta/core';
import { MessageDbProvisioner } from '@posta/message-db';
import { awsSettings, parseSesEvent } from '@posta/aws';
import { enqueueSesEvent } from '@posta/aws';

export interface SqsClient { send(command: any): Promise<any> }

export async function pollSesQueue(config: PostaConfig, sqs: SqsClient, waitSeconds = 20, db: Queryable = getMainDb(config)): Promise<number> {
  const { queueUrl, topicArns } = awsSettings(config);
  if (!queueUrl) return 0;
  const result = await sqs.send(new ReceiveMessageCommand({ QueueUrl: queueUrl,
    MaxNumberOfMessages: 10, WaitTimeSeconds: waitSeconds, VisibilityTimeout: 60 }));
  const acknowledged: Message[] = [];
  const messages: Message[] = result.Messages ?? [];
  for (const message of messages) {
    if (!message.ReceiptHandle) continue;
    try {
      const envelope = JSON.parse(message.Body ?? '');
      if (envelope.Type === 'Notification' && typeof envelope.MessageId === 'string' && topicArns.includes(envelope.TopicArn)) {
        let payload: unknown;
        try { payload = JSON.parse(envelope.Message); } catch { payload = null; }
        await enqueueSesEvent(db, envelope.TopicArn, envelope.MessageId, payload);
      }
      // Invalid or foreign-topic events cannot become valid on retry.
      acknowledged.push(message);
    } catch (error) {
      if (error instanceof SyntaxError) acknowledged.push(message);
      else console.error('[ses-events] Keeping SQS event for redelivery:', error);
    }
  }
  if (acknowledged.length) {
    const deleted = await sqs.send(new DeleteMessageBatchCommand({ QueueUrl: queueUrl,
      Entries: acknowledged.map((message, i) => ({ Id: String(i), ReceiptHandle: message.ReceiptHandle! })) }));
    if (deleted.Failed?.length) console.warn('[ses-events] SQS deletes failed; receipts will be deduplicated on redelivery');
  }
  return messages.length;
}

export function startSesQueue(config: PostaConfig): { stop(): void } {
  let running = true;
  const settings = awsSettings(config);
  // Send feedback and received mail arrive on the same queue, so either one needs the poller.
  const usesSes = config.posta.delivery_provider === 'ses' || (config.posta.inbound_provider ?? 'ses') === 'ses';
  if (!settings.queueUrl || !usesSes) return { stop() {} };
  const sqs = new SQSClient({ region: settings.region });
  void (async () => {
    while (running) {
      try { await pollSesQueue(config, sqs); }
      catch (error) {
        if (!running) break;
        console.error('[ses-events] SQS receive failed:', error);
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      }
    }
  })();
  return { stop() { running = false; sqs.destroy(); } };
}

export async function processSesEventsJob(config: PostaConfig): Promise<boolean> {
  const mainDb = getMainDb(config);
  return mainDb.transaction(async (tx) => {
    // Received mail (kind 'inbound') needs a fetch from S3, so ses-inbound.ts claims it instead.
    const inbox = await tx.get<any>(`SELECT * FROM ses_event_inbox WHERE processed_at IS NULL AND kind = 'event'
      AND (retry_after IS NULL OR retry_after <= NOW()) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`);
    if (!inbox) return false;
    try {
      const event = parseSesEvent(typeof inbox.payload === 'string' ? JSON.parse(inbox.payload) : inbox.payload);
      if (!event) throw new Error('Invalid stored SES event');
      const region = inbox.topic_arn.split(':')[3];
      const receipt = await tx.get<{ server_id: number; message_id: number }>(`SELECT server_id, message_id FROM ses_messages
        WHERE region = $1 AND provider_message_id = $2`, [region, event.messageId]);
      if (!receipt) throw new Error('SES acceptance receipt has not arrived yet');
      const provisioner = new MessageDbProvisioner(config);
      const msgDb = await provisioner.openServerDb(receipt.server_id, getServerDb(config, receipt.server_id));
      await msgDb.db.transaction(async (messageTx) => {
        const duplicate = await messageTx.get(`SELECT 1 FROM ses_event_receipts WHERE topic_arn = $1 AND sns_message_id = $2`, [inbox.topic_arn, inbox.sns_message_id]);
        if (duplicate) return;
        const message = await messageTx.get<any>(`SELECT * FROM messages WHERE id = $1 FOR UPDATE`, [receipt.message_id]);
        // Retention can remove a message before a delayed event arrives.
        if (message) {
          const effects = eventEffects(event, message.rcpt_to);
          await messageTx.run(`UPDATE messages SET status = CASE WHEN status IN ('Bounced', 'HardFail') AND $1 NOT IN ('Bounced', 'HardFail')
            THEN status ELSE $1 END, last_delivery_attempt = $2 WHERE id = $3`,
            [effects.status, Date.parse(event.timestamp) / 1000, message.id]);
          await messageTx.run(`INSERT INTO deliveries (message_id, status, details, timestamp)
            VALUES ($1, $2, $3, $4)`, [message.id, effects.status, effects.details, Date.parse(event.timestamp) / 1000]);
          if (effects.suppress) await suppressRecipient(messageTx, message.rcpt_to, effects.details);
        }
        await messageTx.run(`INSERT INTO ses_event_receipts (topic_arn, sns_message_id) VALUES ($1, $2)`, [inbox.topic_arn, inbox.sns_message_id]);
      });
      const webhookEvent = event.type === 'Delivery' ? 'MessageSent' : event.type === 'DeliveryDelay' ? 'MessageDelayed'
        : ['Bounce', 'Complaint', 'Reject', 'Rendering Failure'].includes(event.type) ? 'MessageDeliveryFailed' : null;
      if (webhookEvent) {
        const payload = JSON.stringify({ event: webhookEvent, timestamp: event.timestamp,
          payload: { server_id: receipt.server_id, message_id: receipt.message_id, region, ses_message_id: event.messageId, type: event.type } });
        await tx.run(`INSERT INTO webhook_requests (server_id, webhook_id, url, event, uuid, payload, created_at)
          SELECT $1, w.id, w.url, $2, $3 || ':' || w.id, $4, NOW() FROM webhooks w
          WHERE w.server_id = $1 AND w.enabled <> 0 AND (w.all_events <> 0 OR EXISTS
            (SELECT 1 FROM webhook_events e WHERE e.webhook_id = w.id AND e.event = $2))`,
          [receipt.server_id, webhookEvent, inbox.sns_message_id, payload]);
      }
      await tx.run(`UPDATE ses_event_inbox SET processed_at = NOW(), error = NULL WHERE topic_arn = $1 AND sns_message_id = $2`, [inbox.topic_arn, inbox.sns_message_id]);
    } catch (error: any) {
      await tx.run(`UPDATE ses_event_inbox SET attempts = attempts + 1, error = $1,
        retry_after = NOW() + INTERVAL '30 seconds' WHERE topic_arn = $2 AND sns_message_id = $3`,
        [error.message, inbox.topic_arn, inbox.sns_message_id]);
      console.warn(`[ses-events] Event ${inbox.sns_message_id} will retry: ${error.message}`);
    }
    return true;
  });
}

async function suppressRecipient(db: Queryable, address: string, reason: string) {
  const keepUntil = Date.now() / 1000 + 30 * 86400;
  const existing = await db.get<{ id: number }>(`SELECT id FROM suppressions WHERE type = 'recipient' AND address = $1`, [address]);
  if (existing) await db.run(`UPDATE suppressions SET reason = $1, keep_until = $2 WHERE id = $3`, [reason, keepUntil, existing.id]);
  else await db.run(`INSERT INTO suppressions (type, address, reason, timestamp, keep_until) VALUES ('recipient', $1, $2, $3, $4)`, [address, reason, Date.now() / 1000, keepUntil]);
}

export function eventEffects(event: NonNullable<ReturnType<typeof parseSesEvent>>, recipient: string) {
  const bounceRecipient = event.bounce?.bouncedRecipients.some((r) => r.emailAddress.toLowerCase() === recipient.toLowerCase());
  const complaintRecipient = event.complaint?.complainedRecipients.some((r) => r.emailAddress.toLowerCase() === recipient.toLowerCase());
  return {
    status: event.type === 'Bounce' ? 'Bounced' : ['Complaint', 'Reject', 'Rendering Failure'].includes(event.type) ? 'HardFail'
      : event.type === 'DeliveryDelay' ? 'SoftFail' : 'Sent',
    suppress: (event.type === 'Bounce' && event.bounce?.bounceType === 'Permanent' && bounceRecipient)
      || (event.type === 'Complaint' && complaintRecipient),
    details: `SES ${event.type}: ${event.bounce?.bouncedRecipients[0]?.diagnosticCode ?? event.complaint?.complaintFeedbackType ?? event.delivery?.smtpResponse ?? event.type}`,
  };
}

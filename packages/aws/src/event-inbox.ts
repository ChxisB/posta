import type { Queryable } from '@posta/core';
import { parseSesEvent, parseSesReceipt } from './ses-events';

/**
 * Both authenticated SQS and verified HTTPS SNS deliveries use this durable inbox.
 * Send feedback (kind 'event') and received mail (kind 'inbound') share it; the worker
 * runs a separate job for each, because only received mail needs a fetch from S3.
 */
export async function enqueueSesEvent(db: Queryable, topicArn: string, snsMessageId: string, payload: unknown): Promise<boolean> {
  const kind = parseSesReceipt(payload) ? 'inbound' : parseSesEvent(payload) ? 'event' : null;
  if (!kind) return false;
  await db.run(`INSERT INTO ses_event_inbox (topic_arn, sns_message_id, payload, kind) VALUES ($1, $2, $3::jsonb, $4)
    ON CONFLICT(topic_arn, sns_message_id) DO NOTHING`, [topicArn, snsMessageId, payload, kind]);
  return true;
}

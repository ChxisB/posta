import { z } from 'zod';

const address = z.object({ emailAddress: z.string() });
const eventSchema = z.object({
  eventType: z.enum(['Send', 'Delivery', 'DeliveryDelay', 'Bounce', 'Complaint', 'Reject', 'Rendering Failure']).optional(),
  notificationType: z.enum(['Delivery', 'Bounce', 'Complaint']).optional(),
  mail: z.object({ messageId: z.string().min(1), timestamp: z.string().datetime({ offset: true }) }),
  bounce: z.object({ bounceType: z.enum(['Permanent', 'Transient', 'Undetermined']),
    bounceSubType: z.string().optional(), bouncedRecipients: z.array(address.extend({ diagnosticCode: z.string().optional() })) }).optional(),
  complaint: z.object({ complainedRecipients: z.array(address), complaintFeedbackType: z.string().optional() }).optional(),
  delivery: z.object({ smtpResponse: z.string().optional() }).optional(),
});

const verdict = z.object({ status: z.string() }).optional();
// What an S3 receipt-rule action publishes to its SNS topic. The message body is not in
// the notification; the S3 object named by `action` holds it.
const receiptSchema = z.object({
  notificationType: z.literal('Received'),
  mail: z.object({ messageId: z.string().min(1), source: z.string().default(''), timestamp: z.string().datetime({ offset: true }) }),
  receipt: z.object({
    recipients: z.array(z.string().min(3)).min(1),
    spamVerdict: verdict,
    virusVerdict: verdict,
    action: z.object({ type: z.literal('S3'), bucketName: z.string().min(1), objectKey: z.string().min(1) }),
  }),
});

export function parseSesReceipt(payload: unknown) {
  const result = receiptSchema.safeParse(payload);
  if (!result.success) return null;
  const { mail, receipt } = result.data;
  return {
    messageId: mail.messageId, source: mail.source, timestamp: mail.timestamp,
    recipients: [...new Set(receipt.recipients.map((r) => r.toLowerCase()))],
    spam: receipt.spamVerdict?.status ?? 'DISABLED', virus: receipt.virusVerdict?.status ?? 'DISABLED',
    bucket: receipt.action.bucketName, key: receipt.action.objectKey,
  };
}

export type SesReceipt = NonNullable<ReturnType<typeof parseSesReceipt>>;

export function parseSesEvent(payload: unknown) {
  const result = eventSchema.safeParse(payload);
  if (!result.success) return null;
  const data = result.data;
  const type = data.eventType ?? data.notificationType;
  if (!type || (type === 'Bounce' && !data.bounce) || (type === 'Complaint' && !data.complaint)) return null;
  return { type, messageId: data.mail.messageId, timestamp: data.mail.timestamp,
    bounce: data.bounce, complaint: data.complaint, delivery: data.delivery };
}

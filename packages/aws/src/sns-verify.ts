import { createVerify, X509Certificate } from 'node:crypto';
import { z } from 'zod';

export const snsMessageSchema = z.object({
  Type: z.enum(['Notification', 'SubscriptionConfirmation', 'UnsubscribeConfirmation']),
  MessageId: z.string().min(1), TopicArn: z.string().min(1), Message: z.string(),
  Timestamp: z.string(), SignatureVersion: z.enum(['1', '2']), Signature: z.string().min(1),
  SigningCertURL: z.string(), Subject: z.string().nullish(),
  Token: z.string().optional(), SubscribeURL: z.string().optional(),
});
export type SnsMessage = z.infer<typeof snsMessageSchema>;

export function isAllowedSnsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
      && /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(url.hostname);
  } catch { return false; }
}

export function canonicalString(message: SnsMessage): string {
  const fields: Array<keyof SnsMessage> = message.Type === 'Notification'
    ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
    : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
  return fields.filter((field) => message[field] != null)
    .map((field) => `${field}\n${message[field]}\n`).join('');
}

const certificates = new Map<string, string>();
async function fetchCertificate(url: string): Promise<string> {
  const hit = certificates.get(url);
  if (hit) return hit;
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('SNS signing certificate is unavailable');
  const certificate = await response.text();
  if (certificates.size >= 64) certificates.clear();
  certificates.set(url, certificate);
  return certificate;
}

export async function verifySnsMessage(message: SnsMessage, allowedTopics: readonly string[],
  certificateFetcher: (url: string) => Promise<string> = fetchCertificate): Promise<boolean> {
  if (!allowedTopics.includes(message.TopicArn)) return false;
  if (!isAllowedSnsUrl(message.SigningCertURL)) return false;
  const url = new URL(message.SigningCertURL);
  const topicRegion = message.TopicArn.split(':')[3];
  if (url.hostname !== `sns.${topicRegion}.amazonaws.com` || !/^\/SimpleNotificationService-[a-zA-Z0-9]+\.pem$/.test(url.pathname)) return false;
  const stamp = Date.parse(message.Timestamp);
  if (!Number.isFinite(stamp) || Math.abs(Date.now() - stamp) > 15 * 60_000) return false;
  try {
    const pem = await certificateFetcher(`${url.origin}${url.pathname}`);
    const cert = new X509Certificate(pem);
    const verifier = createVerify(message.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1');
    verifier.update(canonicalString(message));
    return verifier.verify(cert.publicKey, Buffer.from(message.Signature, 'base64'));
  } catch { return false; }
}

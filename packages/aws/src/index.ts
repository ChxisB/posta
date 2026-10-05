import { generateKeyPairSync } from 'node:crypto';
import {
  SESv2Client, SendEmailCommand, GetAccountCommand, CreateEmailIdentityCommand,
  GetEmailIdentityCommand, PutEmailIdentityDkimSigningAttributesCommand,
  PutEmailIdentityMailFromAttributesCommand,
} from '@aws-sdk/client-sesv2';
import { DnsResolver, stripNameFromAddress, type PostaConfig, type Queryable } from '@posta/core';
import { inboundMxHost } from './inbound';

export * from './sns-verify';
export * from './ses-events';
export * from './event-inbox';
export * from './inbound';

export interface SesDomain {
  id: number;
  server_id: number;
  name: string;
  ses_region: string | null;
  /** The region whose receipt rules take this domain's mail; null when Posta's SMTP server does. */
  ses_inbound_region?: string | null;
  ses_dkim_public_key: string | null;
  ses_dkim_selector: string | null;
  ses_mail_from_subdomain: string | null;
  verified_at?: Date | string | null;
  inbound_verified_at?: Date | string | null;
  outgoing?: number;
  incoming?: number;
}

export function awsSettings(config: PostaConfig) {
  const aws = config.aws;
  const region = aws?.region ?? 'us-east-1';
  return {
    region,
    regions: aws?.regions.length ? aws.regions : [region],
    configurationSet: aws?.configuration_set ?? 'posta',
    topicArns: aws?.sns_topic_arns ?? [],
    queueUrl: aws?.sqs_queue_url,
    maxSendRate: aws?.max_send_rate ?? 14,
    mailFromSubdomain: aws?.mail_from_subdomain ?? 'bounce',
  };
}

export function requireServedRegion(config: PostaConfig, region?: string): string {
  const regions = awsSettings(config).regions;
  const selected = region ?? regions[0];
  if (!regions.includes(selected)) throw new Error(`SES region ${selected} is not configured on this installation`);
  return selected;
}

export function normalizeDomain(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/\.$/, '');
  if (normalized.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalized)) {
    throw new Error('Enter a valid domain name, such as example.com');
  }
  return normalized;
}

export interface SesClient { send(command: any): Promise<any> }
export class SesDeferredError extends Error {
  name = 'SesDeferredError';
}

/** Clients and account limits are isolated by region, using the AWS credential chain. */
export class SesService {
  private clients = new Map<string, SesClient>();
  private accounts = new Map<string, { at: number; value: Promise<any> }>();
  constructor(private config: PostaConfig, private factory: (region: string) => SesClient =
    (region) => new SESv2Client({ region, maxAttempts: 1 })) {}

  client(region: string): SesClient {
    requireServedRegion(this.config, region);
    let client = this.clients.get(region);
    if (!client) { client = this.factory(region); this.clients.set(region, client); }
    return client;
  }

  account(region: string): Promise<any> {
    const hit = this.accounts.get(region);
    if (hit && Date.now() - hit.at < 60_000) return hit.value;
    const value = this.client(region).send(new GetAccountCommand({}));
    this.accounts.set(region, { at: Date.now(), value });
    value.catch(() => this.accounts.delete(region));
    return value;
  }

  private async createIdentity(client: SesClient, name: string, attrs: { DomainSigningSelector: string; DomainSigningPrivateKey: string }) {
    try {
      await client.send(new CreateEmailIdentityCommand({ EmailIdentity: name, DkimSigningAttributes: attrs }));
    } catch (error: any) {
      // Recover an orphan left by an earlier partial create on this self-hosted account.
      if (error.name !== 'AlreadyExistsException') throw error;
      await client.send(new PutEmailIdentityDkimSigningAttributesCommand({
        EmailIdentity: name, SigningAttributesOrigin: 'EXTERNAL', SigningAttributes: attrs,
      }));
    }
  }

  async provision(name: string, region: string, inboundRegion: string | null = null) {
    requireServedRegion(this.config, region);
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const selector = this.config.dns.dkim_identifier;
    const privateKeyB64 = privateKey.export({ format: 'der', type: 'pkcs1' }).toString('base64');
    const publicKeyB64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    const attrs = { DomainSigningSelector: selector, DomainSigningPrivateKey: privateKeyB64 };
    const client = this.client(region);
    await this.createIdentity(client, name, attrs);
    // SES only receives for a domain verified in the receiving region. The same key and
    // selector are used there, so the one DKIM record already published verifies both.
    if (inboundRegion && inboundRegion !== region) await this.createIdentity(this.client(inboundRegion), name, attrs);
    const subdomain = awsSettings(this.config).mailFromSubdomain;
    await client.send(new PutEmailIdentityMailFromAttributesCommand({
      EmailIdentity: name, MailFromDomain: `${subdomain}.${name}`, BehaviorOnMxFailure: 'USE_DEFAULT_VALUE',
    }));
    return { publicKey: publicKeyB64, selector, mailFromSubdomain: subdomain };
  }

  async verification(domain: SesDomain) {
    const region = requireServedRegion(this.config, domain.ses_region ?? undefined);
    return this.client(region).send(new GetEmailIdentityCommand({ EmailIdentity: domain.name }));
  }

  async sendRaw(input: { domain: SesDomain; raw: string; recipient: string; serverId: number; messageId: number }, db: Queryable) {
    const region = requireServedRegion(this.config, input.domain.ses_region ?? undefined);
    if (!input.domain.ses_region || !input.domain.verified_at || input.domain.outgoing === 0) {
      throw new Error('The sender domain must be provisioned and verified in SES before sending');
    }
    const settings = awsSettings(this.config);
    if (!settings.topicArns.length) throw new SesDeferredError('Configure SNS_TOPIC_ARNS for SES delivery events before sending');
    const account = await this.account(region);
    const quota = account.SendQuota;
    if (account.SendingEnabled === false || !quota?.MaxSendRate || (quota.Max24HourSend ?? 0) <= (quota.SentLast24Hours ?? 0)) {
      throw new SesDeferredError(`SES sending is paused or its daily quota is exhausted in ${region}`);
    }
    const rate = Math.min(settings.maxSendRate, quota.MaxSendRate);
    // A PostgreSQL reservation coordinates the send rate across worker processes.
    const slot = await db.get<{ send_at: Date }>(`
      INSERT INTO ses_send_slots (region, next_send_at)
      VALUES ($1, NOW() + ($2 * INTERVAL '1 millisecond'))
      ON CONFLICT(region) DO UPDATE SET next_send_at = GREATEST(ses_send_slots.next_send_at, NOW()) + ($2 * INTERVAL '1 millisecond')
      WHERE ses_send_slots.next_send_at <= NOW() + INTERVAL '30 seconds'
      RETURNING next_send_at - ($2 * INTERVAL '1 millisecond') AS send_at
    `, [region, 1000 / rate]);
    if (!slot) throw new SesDeferredError(`SES rate capacity is busy in ${region}`);
    const delay = slot ? Math.max(0, new Date(slot.send_at).getTime() - Date.now()) : 0;
    if (delay > 30_000) throw new SesDeferredError(`SES rate capacity is busy in ${region}`);
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const result = await this.client(region).send(new SendEmailCommand({
      Content: { Raw: { Data: Buffer.from(input.raw, 'binary') } },
      // One Posta row per recipient: MIME To/Cc/Bcc must never widen the envelope.
      Destination: { ToAddresses: [input.recipient] },
      ConfigurationSetName: settings.configurationSet,
      EmailTags: [{ Name: 'posta_message_id', Value: `${input.serverId}:${input.messageId}` }],
    }));
    if (!result.MessageId) throw new Error('SES returned no message ID');
    return { messageId: result.MessageId as string, region };
  }
}

const services = new WeakMap<PostaConfig, SesService>();
export function getSesService(config: PostaConfig): SesService {
  let service = services.get(config);
  if (!service) { service = new SesService(config); services.set(config, service); }
  return service;
}

export interface DnsRecord {
  type: 'TXT' | 'MX'; name: string; value: string; priority?: number;
  purpose: 'dkim' | 'spf' | 'return_path' | 'mx' | 'dmarc';
}

export function sesDnsRecords(config: PostaConfig, domain: SesDomain): DnsRecord[] {
  const mailFrom = `${domain.ses_mail_from_subdomain ?? awsSettings(config).mailFromSubdomain}.${domain.name}`;
  const records: DnsRecord[] = [
    { type: 'TXT', name: `${domain.ses_dkim_selector ?? config.dns.dkim_identifier}._domainkey.${domain.name}`,
      value: `v=DKIM1; k=rsa; p=${domain.ses_dkim_public_key ?? ''}`, purpose: 'dkim' },
    { type: 'TXT', name: mailFrom, value: 'v=spf1 include:amazonses.com ~all', purpose: 'spf' },
    { type: 'MX', name: mailFrom, value: `feedback-smtp.${domain.ses_region}.amazonses.com`, priority: 10, purpose: 'return_path' },
    { type: 'TXT', name: `_dmarc.${domain.name}`, value: 'v=DMARC1; p=none;', purpose: 'dmarc' },
  ];
  if (domain.incoming !== 0) {
    // SES takes this domain's mail when it has a receiving region; otherwise Posta's SMTP server does.
    const hosts = domain.ses_inbound_region ? [inboundMxHost(domain.ses_inbound_region)] : config.dns.mx_records;
    hosts.forEach((value, i) => records.push({ type: 'MX', name: domain.name, value, priority: 10 + i * 10, purpose: 'mx' }));
  }
  return records;
}

/** Sending verification is independent of receiving: apex MX is never an SES send gate. */
export async function checkSesDomain(config: PostaConfig, db: Pick<Queryable, 'run'>, domain: SesDomain,
  service = getSesService(config), resolver: Pick<DnsResolver, 'txt' | 'mx'> = DnsResolver.local()) {
  if (!domain.ses_region) throw new Error('Provision this domain in SES first');
  const identity = await service.verification(domain);
  const records = sesDnsRecords(config, domain);
  const verdicts = await Promise.all(records.map(async (record) => {
    if (record.purpose === 'dmarc') return { ...record, status: 'Optional' };
    try {
      const matches = record.type === 'TXT'
        ? (await resolver.txt(record.name)).some((v) => v.replace(/\s+/g, '') === record.value.replace(/\s+/g, ''))
        : (await resolver.mx(record.name)).some((v) => v.exchange.replace(/\.$/, '').toLowerCase() === record.value.replace(/\.$/, '').toLowerCase() && v.preference === record.priority);
      return { ...record, status: matches ? 'OK' : 'Missing' };
    } catch { return { ...record, status: 'Error' }; }
  }));
  const status = (purpose: DnsRecord['purpose']) => verdicts.filter((r) => r.purpose === purpose).every((r) => r.status === 'OK') ? 'OK' : 'Missing';
  const dkim = identity.DkimAttributes?.Status === 'SUCCESS' ? status('dkim') : 'Missing';
  const mailFrom = identity.MailFromAttributes?.MailFromDomainStatus === 'SUCCESS';
  const spf = mailFrom ? status('spf') : 'Missing';
  const returnPath = mailFrom ? status('return_path') : 'Missing';
  const verified = identity.VerifiedForSendingStatus === true && dkim === 'OK' && spf === 'OK' && returnPath === 'OK';
  // A domain received in another region is only ready once that region has verified it too.
  let inboundIdentityOk = true;
  if (domain.ses_inbound_region && domain.ses_inbound_region !== domain.ses_region) {
    const inbound = await service.verification({ ...domain, ses_region: domain.ses_inbound_region });
    inboundIdentityOk = inbound.DkimAttributes?.Status === 'SUCCESS';
  }
  await db.run(`UPDATE domains SET verified_at = CASE WHEN $1 THEN COALESCE(verified_at, NOW()) ELSE NULL END,
    dkim_status = $2, spf_status = $3, return_path_status = $4, mx_status = $5,
    inbound_verified_at = CASE WHEN $7 THEN COALESCE(inbound_verified_at, NOW()) ELSE inbound_verified_at END,
    dns_checked_at = NOW(), updated_at = NOW() WHERE id = $6`,
    [verified, dkim, spf, returnPath, domain.incoming === 0 ? 'NotRequired' : status('mx'), domain.id, dkim === 'OK' && inboundIdentityOk]);
  return { verified, dkim_status: dkim, spf_status: spf, return_path_status: returnPath,
    mx_status: domain.incoming === 0 ? 'NotRequired' : status('mx'), records: verdicts, region: domain.ses_region };
}

export async function findSendingDomain(db: Queryable, serverId: number, from: string): Promise<SesDomain | undefined> {
  const address = stripNameFromAddress(from)?.trim();
  const name = address?.split('@')[1]?.toLowerCase();
  if (!name) return undefined;
  return db.get<SesDomain>(`SELECT * FROM domains WHERE server_id = $1 AND lower(name) = $2 AND outgoing <> 0 ORDER BY id LIMIT 1`, [serverId, name]);
}

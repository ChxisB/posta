import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createSign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, type Queryable } from '@posta/core';
import {
  InboundRejectedError, SesInboundStore, SesService, assertReceiptLocation, awsSettings, checkSesDomain, inboundMxHost,
  requireServedRegion, resolveInboundRegion, sesDnsRecords, type SesDomain,
} from './index';
import { canonicalString, verifySnsMessage, type SnsMessage } from './sns-verify';
import { enqueueSesEvent } from './event-inbox';
import { parseSesEvent, parseSesReceipt } from './ses-events';

const config = loadConfig('/dev/null');
config.aws = { region: 'us-east-1', regions: ['eu-west-1', 'us-east-1'], configuration_set: 'posta',
  sns_topic_arns: [], max_send_rate: 14, mail_from_subdomain: 'bounce', inbound_buckets: {}, inbound_prefix: 'inbound/' };
config.dns.mx_records = ['mx.posta.test'];
const domain: SesDomain = { id: 1, server_id: 2, name: 'example.com', ses_region: 'eu-west-1',
  ses_dkim_public_key: 'public-key', ses_dkim_selector: 'posta', ses_mail_from_subdomain: 'bounce', incoming: 1 };

const db: Pick<Queryable, 'run'> = { async run() { return { changes: 1 }; } };
const dns = {
  async txt(name: string) { return name.includes('_domainkey') ? ['v=DKIM1; k=rsa; p=public-key'] : ['v=spf1 include:amazonses.com ~all']; },
  async mx(name: string) { return name.startsWith('bounce.') ? [{ exchange: 'feedback-smtp.eu-west-1.amazonses.com.', preference: 10 }] : []; },
};
const identity = { DkimAttributes: { Status: 'SUCCESS' }, MailFromAttributes: { MailFromDomainStatus: 'SUCCESS' }, VerifiedForSendingStatus: true };

describe('regional SES identity and DNS', () => {
  it('uses the first served region as the domain default while keeping the SQS region', () => {
    expect(requireServedRegion(config)).toBe('eu-west-1');
    expect(awsSettings(config).region).toBe('us-east-1');
    expect(() => requireServedRegion(config, 'ap-south-1')).toThrow('not configured');
  });
  it('keeps inbound MX on the domain and SES return-path MX on a separate subdomain', () => {
    const records = sesDnsRecords(config, domain);
    expect(records.find((r) => r.purpose === 'mx')).toMatchObject({ name: 'example.com', value: 'mx.posta.test' });
    expect(records.find((r) => r.purpose === 'return_path')).toMatchObject({ name: 'bounce.example.com', value: 'feedback-smtp.eu-west-1.amazonses.com' });
    expect(records.find((r) => r.purpose === 'spf')?.name).toBe('bounce.example.com');
  });
  it('does not gate outbound verification on apex MX or optional DMARC', async () => {
    const service = new SesService(config, () => ({ async send() { return identity; } }));
    const result = await checkSesDomain(config, db, domain, service, dns);
    expect(result.verified).toBe(true); expect(result.mx_status).toBe('Missing');
  });
  it('rejects DNS with the wrong region or priority even when SES reports verified', async () => {
    const service = new SesService(config, () => ({ async send() { return identity; } }));
    const result = await checkSesDomain(config, db, domain, service, { ...dns,
      async mx() { return [{ exchange: 'feedback-smtp.us-east-1.amazonses.com', preference: 10 }]; } });
    expect(result.verified).toBe(false); expect(result.return_path_status).toBe('Missing');
  });
  it('uploads BYODKIM privately and only returns a public key for persistence', async () => {
    const commands: any[] = [];
    const service = new SesService(config, () => ({ async send(command) { commands.push(command); return {}; } }));
    const result = await service.provision('example.com', 'eu-west-1');
    expect(result.publicKey.length).toBeGreaterThan(300);
    expect(result).not.toHaveProperty('privateKey');
    expect(commands[0].input.DkimSigningAttributes.DomainSigningPrivateKey.length).toBeGreaterThan(1000);
    expect(commands[1].input.MailFromDomain).toBe('bounce.example.com');
  });
  it('recovers a partial identity creation without storing the private key', async () => {
    const commands: any[] = [];
    const service = new SesService(config, () => ({ async send(command) {
      commands.push(command);
      if (command.constructor.name === 'CreateEmailIdentityCommand') { const error = new Error('exists'); error.name = 'AlreadyExistsException'; throw error; }
      return {};
    } }));
    await service.provision('example.com', 'eu-west-1');
    expect(commands.map((c) => c.constructor.name)).toEqual([
      'CreateEmailIdentityCommand', 'PutEmailIdentityDkimSigningAttributesCommand', 'PutEmailIdentityMailFromAttributesCommand',
    ]);
  });
});

let certificate: string;
let privateKey: string;
let directory: string;
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'posta-sns-'));
  const result = Bun.spawnSync(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-subj', '/CN=Posta SNS test', '-days', '1', '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem')]);
  expect(result.exitCode).toBe(0);
  certificate = readFileSync(join(directory, 'cert.pem'), 'utf8');
  privateKey = readFileSync(join(directory, 'key.pem'), 'utf8');
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const topic = 'arn:aws:sns:eu-west-1:123456789012:posta-events';
function signed(type: SnsMessage['Type'] = 'Notification'): SnsMessage {
  const message: SnsMessage = { Type: type, MessageId: 'sns-event-1', TopicArn: topic, Message: 'SES event',
    Timestamp: new Date().toISOString(), SignatureVersion: '2', Signature: '',
    SigningCertURL: 'https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-abcdef.pem',
    ...(type === 'SubscriptionConfirmation' ? { Token: 'token', SubscribeURL: 'https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription' } : {}) };
  const fields = type === 'Notification' ? ['Message', 'MessageId', 'Timestamp', 'TopicArn', 'Type'] : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
  const payload = fields.map((field) => `${field}\n${(message as any)[field]}\n`).join('');
  message.Signature = createSign('RSA-SHA256').update(payload).sign(privateKey, 'base64');
  return message;
}

describe('SNS authenticity and SES events', () => {
  it('accepts correctly signed notifications and subscription confirmations', async () => {
    expect(await verifySnsMessage(signed(), [topic], async () => certificate)).toBe(true);
    expect(await verifySnsMessage(signed('SubscriptionConfirmation'), [topic], async () => certificate)).toBe(true);
  });
  it('rejects tampering, replay, foreign topics and malicious certificate URLs before fetching', async () => {
    expect(await verifySnsMessage({ ...signed(), Message: 'forged' }, [topic], async () => certificate)).toBe(false);
    let fetched = false;
    const fetcher = async () => { fetched = true; return certificate; };
    expect(await verifySnsMessage(signed(), ['foreign-topic'], fetcher)).toBe(false);
    expect(await verifySnsMessage({ ...signed(), Timestamp: '2000-01-01T00:00:00Z' }, [topic], fetcher)).toBe(false);
    expect(await verifySnsMessage({ ...signed(), SigningCertURL: 'https://sns.eu-west-1.amazonaws.com.attacker.test/a.pem' }, [topic], fetcher)).toBe(false);
    expect(await verifySnsMessage({ ...signed(), SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abcdef.pem' }, [topic], fetcher)).toBe(false);
    expect(fetched).toBe(false);
  });
  it('handles nullable Subject fields and rejects malformed SES payloads', () => {
    const message = signed();
    expect(canonicalString({ ...message, Subject: null })).toBe(canonicalString(message));
    expect(parseSesEvent({ eventType: 'Bounce', mail: { messageId: '1', timestamp: new Date().toISOString() } })).toBeNull();
    expect(parseSesEvent({ eventType: 'Delivery', mail: { messageId: '', timestamp: new Date().toISOString() } })).toBeNull();
  });
});

const received = (overrides: Record<string, unknown> = {}) => ({
  notificationType: 'Received',
  mail: { messageId: 'abc123', source: 'sender@external.test', timestamp: '2026-10-05T10:00:00.000Z' },
  receipt: { recipients: ['Support@Example.com', 'support@example.com', 'sales@example.com'],
    spamVerdict: { status: 'FAIL' }, virusVerdict: { status: 'PASS' },
    action: { type: 'S3', topicArn: topic, bucketName: 'posta-inbound-eu', objectKey: 'inbound/abc123' } },
  ...overrides,
});

const inboundConfig = loadConfig('/dev/null');
inboundConfig.aws = { ...config.aws!, regions: ['us-east-1', 'eu-west-1'], inbound_buckets: { 'eu-west-1': 'posta-inbound-eu' }, inbound_prefix: 'inbound/' };
inboundConfig.dns.mx_records = ['mx.posta.test'];
const served = ['us-east-1', 'eu-west-1'];

describe('SES received mail notifications', () => {
  it('reads the message, recipients, verdicts and object location, lowercasing and deduplicating recipients', () => {
    expect(parseSesReceipt(received())).toEqual({
      messageId: 'abc123', source: 'sender@external.test', timestamp: '2026-10-05T10:00:00.000Z',
      recipients: ['support@example.com', 'sales@example.com'], spam: 'FAIL', virus: 'PASS',
      bucket: 'posta-inbound-eu', key: 'inbound/abc123',
    });
  });
  it('treats an absent verdict as disabled, which is what SES sends when scanning is off', () => {
    const payload = received();
    delete (payload.receipt as any).spamVerdict; delete (payload.receipt as any).virusVerdict;
    expect(parseSesReceipt(payload)).toMatchObject({ spam: 'DISABLED', virus: 'DISABLED' });
  });
  it('rejects anything that is not mail SES stored in S3', () => {
    expect(parseSesReceipt({ ...received(), notificationType: 'Delivery' })).toBeNull();
    expect(parseSesReceipt(received({ receipt: { recipients: [], action: { type: 'S3', bucketName: 'b', objectKey: 'k' } } }))).toBeNull();
    expect(parseSesReceipt(received({ receipt: { recipients: ['a@b.test'], action: { type: 'SNS', topicArn: topic } } }))).toBeNull();
    expect(parseSesReceipt({ mail: { messageId: 'x' } })).toBeNull();
    expect(parseSesReceipt(null)).toBeNull();
  });
  it('files received mail and send feedback in the one inbox under different kinds, and drops the rest', async () => {
    const rows: any[][] = [];
    const recorder = { async run(_sql: string, params: any[]) { rows.push(params); return { changes: 1 }; } } as any;
    expect(await enqueueSesEvent(recorder, topic, 'sns-1', received())).toBe(true);
    expect(await enqueueSesEvent(recorder, topic, 'sns-2', { eventType: 'Delivery', mail: { messageId: 'm', timestamp: new Date().toISOString() } })).toBe(true);
    expect(await enqueueSesEvent(recorder, topic, 'sns-3', { hello: 'world' })).toBe(false);
    expect(rows.map((r) => [r[1], r[3]])).toEqual([['sns-1', 'inbound'], ['sns-2', 'event']]);
  });
});

describe('choosing a receiving region', () => {
  it('defaults to the sending region when it has an inbound bucket', () => {
    expect(resolveInboundRegion(inboundConfig, { sendingRegion: 'eu-west-1', served })).toBe('eu-west-1');
  });
  it('falls back to Posta SMTP when the sending region has no bucket, so receiving never silently breaks', () => {
    expect(resolveInboundRegion(inboundConfig, { sendingRegion: 'us-east-1', served })).toBeNull();
    expect(resolveInboundRegion(config, { sendingRegion: 'eu-west-1', served })).toBeNull();
  });
  it('lets a domain opt out to Posta SMTP, whatever the region or provider', () => {
    expect(resolveInboundRegion(inboundConfig, { requested: 'smtp', sendingRegion: 'eu-west-1', served })).toBeNull();
    const smtp = loadConfig('/dev/null'); smtp.aws = inboundConfig.aws; smtp.posta.inbound_provider = 'smtp';
    expect(resolveInboundRegion(smtp, { requested: 'smtp', sendingRegion: 'eu-west-1', served })).toBeNull();
  });
  it('lets a sending-only region receive somewhere else', () => {
    expect(resolveInboundRegion(inboundConfig, { requested: 'eu-west-1', sendingRegion: 'ap-south-2', served })).toBe('eu-west-1');
  });
  it('refuses a region that has no bucket or is not served', () => {
    expect(() => resolveInboundRegion(inboundConfig, { requested: 'us-east-1', sendingRegion: 'eu-west-1', served })).toThrow('not set up');
    expect(() => resolveInboundRegion(inboundConfig, { requested: 'eu-west-1', sendingRegion: 'us-east-1', served: ['us-east-1'] })).toThrow('not configured');
  });
  it('is switched off wholesale by inbound_provider = smtp', () => {
    const smtp = loadConfig('/dev/null'); smtp.aws = inboundConfig.aws; smtp.posta.inbound_provider = 'smtp';
    expect(resolveInboundRegion(smtp, { sendingRegion: 'eu-west-1', served })).toBeNull();
    expect(() => resolveInboundRegion(smtp, { requested: 'eu-west-1', sendingRegion: 'eu-west-1', served })).toThrow('switched off');
  });
});

describe('SES inbound DNS and identities', () => {
  const sesInbound: SesDomain = { ...domain, ses_region: 'us-east-1', ses_inbound_region: 'eu-west-1' };

  it('publishes the receiving region SES MX instead of the Posta MX', () => {
    expect(sesDnsRecords(inboundConfig, sesInbound).find((r) => r.purpose === 'mx'))
      .toMatchObject({ name: 'example.com', value: inboundMxHost('eu-west-1'), priority: 10 });
    expect(inboundMxHost('eu-west-1')).toBe('inbound-smtp.eu-west-1.amazonaws.com');
    // The return path still follows the sending region.
    expect(sesDnsRecords(inboundConfig, sesInbound).find((r) => r.purpose === 'return_path')?.value).toBe('feedback-smtp.us-east-1.amazonses.com');
  });
  it('keeps the Posta MX when no receiving region is set', () => {
    expect(sesDnsRecords(inboundConfig, { ...sesInbound, ses_inbound_region: null }).find((r) => r.purpose === 'mx')?.value).toBe('mx.posta.test');
  });
  it('creates the identity in the receiving region with the same DKIM key as the sending region', async () => {
    const commands: any[] = [];
    const service = new SesService(inboundConfig, (region) => ({ async send(command) { commands.push({ region, command }); return {}; } }));
    await service.provision('example.com', 'us-east-1', 'eu-west-1');
    const created = commands.filter((c) => c.command.constructor.name === 'CreateEmailIdentityCommand');
    expect(created.map((c) => c.region)).toEqual(['us-east-1', 'eu-west-1']);
    expect(created[0].command.input.DkimSigningAttributes).toEqual(created[1].command.input.DkimSigningAttributes);
    // Mail-from is a sending feature, so it is only configured where mail is sent from.
    expect(commands.filter((c) => c.command.constructor.name === 'PutEmailIdentityMailFromAttributesCommand').map((c) => c.region)).toEqual(['us-east-1']);
  });
  it('does not create a second identity when sending and receiving share a region', async () => {
    const commands: any[] = [];
    const service = new SesService(inboundConfig, (region) => ({ async send(command) { commands.push({ region, command }); return {}; } }));
    await service.provision('example.com', 'eu-west-1', 'eu-west-1');
    expect(commands.filter((c) => c.command.constructor.name === 'CreateEmailIdentityCommand')).toHaveLength(1);
  });

  const mxDns = { ...dns, async mx(name: string) {
    return name === 'example.com' ? [{ exchange: 'inbound-smtp.eu-west-1.amazonaws.com', preference: 10 }]
      : [{ exchange: 'feedback-smtp.us-east-1.amazonses.com', preference: 10 }];
  } };
  const verification = (inboundDkim: string) => new SesService(inboundConfig, (region) => ({ async send() {
    return region === 'eu-west-1' ? { DkimAttributes: { Status: inboundDkim } } : identity;
  } }));
  const run = async (service: SesService, resolver = mxDns) => {
    const updates: any[][] = [];
    const recorder = { async run(_sql: string, params: any[]) { updates.push(params); return { changes: 1 }; } };
    const result = await checkSesDomain(inboundConfig, recorder, sesInbound, service, resolver);
    return { result, inboundReady: updates[0][6] as boolean };
  };

  it('is ready to receive once both regions have verified the domain and the MX is right', async () => {
    const { result, inboundReady } = await run(verification('SUCCESS'));
    expect(result.mx_status).toBe('OK'); expect(inboundReady).toBe(true);
  });
  it('is not ready to receive while the receiving region is still verifying the domain', async () => {
    const { inboundReady } = await run(verification('PENDING'));
    expect(inboundReady).toBe(false);
  });
  it('flags an MX that still points at the old Posta host', async () => {
    const { result } = await run(verification('SUCCESS'), { ...mxDns, async mx(name: string) {
      return name === 'example.com' ? [{ exchange: 'mx.posta.test', preference: 10 }] : [{ exchange: 'feedback-smtp.us-east-1.amazonses.com', preference: 10 }];
    } });
    expect(result.mx_status).toBe('Missing');
  });
});

describe('reading received mail from S3', () => {
  const location = { bucket: 'posta-inbound-eu', key: 'inbound/abc123' };
  const fake = (handler: (command: any) => any) => {
    const calls: any[] = [];
    const created: string[] = [];
    const store = new SesInboundStore(inboundConfig, (region) => { created.push(region); return { async send(command: any) { calls.push(command); return handler(command); } }; });
    return { store, calls, created };
  };
  const object = (bytes: Uint8Array, length = bytes.length) => ({ ContentLength: length, Body: { transformToByteArray: async () => bytes } });

  it('returns the object as latin1 so every byte survives into the stored message', async () => {
    const bytes = new Uint8Array([0x48, 0x69, 0xe9, 0xff, 0x0d, 0x0a]);
    const { store, calls, created } = fake(() => object(bytes));
    const raw = await store.fetch('eu-west-1', location);
    expect(Array.from(Buffer.from(raw, 'latin1'))).toEqual(Array.from(bytes));
    expect(calls[0].input).toEqual({ Bucket: 'posta-inbound-eu', Key: 'inbound/abc123' });
    await store.fetch('eu-west-1', location);
    expect(created).toEqual(['eu-west-1']);
  });
  it('rejects a location that is not the configured one before touching S3', async () => {
    const { store, calls } = fake(() => object(new Uint8Array()));
    await expect(store.fetch('eu-west-1', { ...location, bucket: 'attacker' })).rejects.toBeInstanceOf(InboundRejectedError);
    await expect(store.fetch('eu-west-1', { ...location, key: 'other/abc123' })).rejects.toBeInstanceOf(InboundRejectedError);
    await expect(store.fetch('eu-west-1', { ...location, key: 'inbound/../secret' })).rejects.toBeInstanceOf(InboundRejectedError);
    await expect(store.fetch('us-east-1', location)).rejects.toBeInstanceOf(InboundRejectedError);
    expect(calls).toHaveLength(0);
  });
  it('rejects an object larger than SES can deliver, and treats a missing one as gone for good', async () => {
    await expect(fake(() => object(new Uint8Array(), 41 * 1024 * 1024)).store.fetch('eu-west-1', location)).rejects.toBeInstanceOf(InboundRejectedError);
    const gone = fake(() => { const error = new Error('missing'); error.name = 'NoSuchKey'; throw error; });
    await expect(gone.store.fetch('eu-west-1', location)).rejects.toBeInstanceOf(InboundRejectedError);
  });
  it('lets any other S3 failure through so the job is retried', async () => {
    const down = fake(() => { throw new Error('S3 is unavailable'); });
    const error = await down.store.fetch('eu-west-1', location).catch((e) => e);
    expect(error.message).toBe('S3 is unavailable');
    expect(error).not.toBeInstanceOf(InboundRejectedError);
  });
  it('deletes the object when asked, and never fails the caller if it cannot', async () => {
    const ok = fake(() => ({}));
    await ok.store.remove('eu-west-1', location);
    expect(ok.calls[0].constructor.name).toBe('DeleteObjectCommand');
    expect(ok.calls[0].input).toEqual({ Bucket: 'posta-inbound-eu', Key: 'inbound/abc123' });
    const failing = fake(() => { throw new Error('AccessDenied'); });
    await failing.store.remove('eu-west-1', location);
    const forged = fake(() => ({}));
    await forged.store.remove('eu-west-1', { ...location, bucket: 'attacker' });
    expect(forged.calls).toHaveLength(0);
  });
  it('checks a location without a store', () => {
    expect(() => assertReceiptLocation(inboundConfig, 'eu-west-1', location)).not.toThrow();
    expect(() => assertReceiptLocation(inboundConfig, 'us-east-1', location)).toThrow('No inbound bucket');
  });
});

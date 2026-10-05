import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  PgClient, closeAllDatabases, createQueuedMessage, getMainDb, getServerDb,
  initializeMainDb, loadConfig, type PostaConfig,
} from '@posta/core';
import { SesService, enqueueSesEvent, type SesDomain } from '@posta/aws';
import { MessageDbProvisioner, MessageStore, type MessageDatabase } from '@posta/message-db';
import { processQueuedMessagesJob } from '../jobs/process_queued_messages';
import { pollSesQueue, processSesEventsJob } from '../ses-events';

const url = 'postgresql://postgres:postgres@localhost:5432';
const database = `posta_test_ses_${Date.now()}`;
let config: PostaConfig;
let msgDb: MessageDatabase;
let serverId: number;
let domains: Record<string, SesDomain> = {};
const calls: Array<{ region: string; command: any }> = [];
const paused = new Set<string>();
let sendError: string | null = null;
let serial = 0;
const topic = (region: string) => `arn:aws:sns:${region}:123456789012:posta-events`;

function service(): SesService {
  return new SesService(config, (region) => ({ async send(command) {
    calls.push({ region, command });
    if (command.constructor.name === 'GetAccountCommand') return {
      ProductionAccessEnabled: true, SendingEnabled: !paused.has(region),
      SendQuota: { MaxSendRate: 1000, Max24HourSend: 50000, SentLast24Hours: 0 },
    };
    if (command.constructor.name === 'SendEmailCommand') {
      if (sendError) { const error = new Error(sendError); error.name = sendError; throw error; }
      return { MessageId: `ses-${region}-${++serial}` };
    }
    return {};
  } }));
}

async function queue(domain: SesDomain, recipient = 'person@recipient.test', raw?: string): Promise<number> {
  const store = new MessageStore(msgDb);
  const content = raw ?? `From: App <app@${domain.name}>\r\nTo: visible@recipient.test\r\nCc: extra@recipient.test\r\nBcc: hidden@recipient.test\r\nSubject: SES test\r\n\r\nHello café 📬`;
  const stored = await store.insertRawMessage(Buffer.from(content, 'utf8'));
  const id = await store.create({ scope: 'outgoing', rcpt_to: recipient, mail_from: `app@${domain.name}`,
    domain_id: domain.id, message_id: `<${crypto.randomUUID()}@${domain.name}>`, subject: 'SES test',
    status: 'Pending', raw_table: stored.tableName, raw_headers_id: stored.headersId, raw_body_id: stored.bodyId });
  await createQueuedMessage(getMainDb(config), { serverId, messageId: id, domainId: domain.id });
  return id;
}
async function status(id: number) { return (await msgDb.db.get<any>('SELECT status FROM messages WHERE id = $1', [id]))?.status; }
async function receipt(id: number) { return getMainDb(config).get<any>('SELECT * FROM ses_messages WHERE server_id = $1 AND message_id = $2', [serverId, id]); }
async function event(id: number, type: string, extra: any = {}, snsId = crypto.randomUUID()) {
  const sent = await receipt(id);
  await enqueueSesEvent(getMainDb(config), topic(sent.region), snsId,
    { eventType: type, mail: { messageId: sent.provider_message_id, timestamp: new Date().toISOString() }, ...extra });
  await processSesEventsJob(config);
  return snsId;
}

beforeAll(async () => {
  const admin = new PgClient(`${url}/postgres`);
  await admin.exec(`CREATE DATABASE ${database}`); await admin.close();
  await closeAllDatabases();
  config = loadConfig('/dev/null');
  config.main_db.url = `${url}/${database}`;
  config.message_db.url = config.main_db.url;
  config.posta.delivery_provider = 'ses';
  config.posta.use_ip_pools = false;
  config.aws = { region: 'us-east-1', regions: ['us-east-1', 'eu-west-1'], configuration_set: 'posta',
    sns_topic_arns: [topic('us-east-1'), topic('eu-west-1')], sqs_queue_url: 'https://sqs.us-east-1.amazonaws.com/123456789012/posta-events',
    max_send_rate: 1000, mail_from_subdomain: 'bounce', inbound_buckets: {}, inbound_prefix: 'inbound/' };
  const db = await initializeMainDb(config);
  const org = await db.get<any>(`INSERT INTO organizations(uuid, name, permalink) VALUES ($1, 'SES tests', 'ses-test') RETURNING id`, [crypto.randomUUID()]);
  const server = await db.get<any>(`INSERT INTO servers(uuid, organization_id, name, mode) VALUES ($1, $2, 'SES', 'Live') RETURNING id`, [crypto.randomUUID(), org.id]);
  serverId = server.id;
  for (const region of config.aws.regions) {
    const name = region === 'us-east-1' ? 'american.test' : 'european.test';
    domains[region] = (await db.get<SesDomain>(`INSERT INTO domains(uuid, server_id, name, ses_region, verified_at, inbound_verified_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *`, [crypto.randomUUID(), serverId, name, region]))!;
  }
  msgDb = await new MessageDbProvisioner(config).openServerDb(serverId, getServerDb(config, serverId));
});

afterAll(async () => {
  await closeAllDatabases();
  const admin = new PgClient(`${url}/postgres`);
  await admin.exec(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`); await admin.close();
});

describe('SES delivery', () => {
  it('routes each domain to its own region and preserves MIME bytes without widening the envelope', async () => {
    const first = await queue(domains['us-east-1']);
    const second = await queue(domains['eu-west-1']);
    const sender = service();
    await processQueuedMessagesJob(config, { ses: sender });
    expect((await receipt(first)).region).toBe('us-east-1');
    expect((await receipt(second)).region).toBe('eu-west-1');
    const sends = calls.filter((c) => c.command.constructor.name === 'SendEmailCommand');
    expect(sends).toHaveLength(2);
    for (const send of sends) {
      expect(send.command.input.Destination).toEqual({ ToAddresses: ['person@recipient.test'] });
      expect(send.command.input.ConfigurationSetName).toBe('posta');
      expect(Buffer.from(send.command.input.Content.Raw.Data).toString('utf8')).toContain('café 📬');
    }
    expect(await status(first)).toBe('Sent');
    expect(await getMainDb(config).get('SELECT 1 FROM queued_messages WHERE message_id = $1', [first])).toBeUndefined();
  });

  it('defers a paused region while another region continues sending', async () => {
    paused.add('us-east-1');
    const first = await queue(domains['us-east-1'], 'paused@recipient.test');
    const second = await queue(domains['eu-west-1'], 'available@recipient.test');
    await processQueuedMessagesJob(config, { ses: service() });
    expect(await status(first)).toBe('SoftFail');
    expect(await receipt(first)).toBeUndefined();
    expect((await receipt(second)).region).toBe('eu-west-1');
    const deferred = await getMainDb(config).get<any>('SELECT * FROM queued_messages WHERE message_id = $1', [first]);
    expect(deferred.retry_after).not.toBeNull(); expect(deferred.locked_by).toBeNull();
    paused.clear();
  });

  it('retains throttled sends for retry and never suppresses on SES request errors', async () => {
    sendError = 'TooManyRequestsException';
    const id = await queue(domains['eu-west-1'], 'throttled@recipient.test');
    await processQueuedMessagesJob(config, { ses: service() });
    expect(await status(id)).toBe('SoftFail');
    expect(await msgDb.db.get(`SELECT * FROM suppressions WHERE address = 'throttled@recipient.test'`)).toBeUndefined();
    sendError = null;
  });

  it('does not send an unverified domain', async () => {
    const domain = domains['us-east-1'];
    await getMainDb(config).run('UPDATE domains SET verified_at = NULL WHERE id = $1', [domain.id]);
    const id = await queue(domain, 'unverified@recipient.test');
    await processQueuedMessagesJob(config, { ses: service() });
    expect(await status(id)).toBe('Held'); expect(await receipt(id)).toBeUndefined();
    await getMainDb(config).run('UPDATE domains SET verified_at = NOW() WHERE id = $1', [domain.id]);
  });

  it('records delivery once even when both SNS and SQS ingest the same event', async () => {
    const id = await queue(domains['eu-west-1'], 'delivered@recipient.test');
    await processQueuedMessagesJob(config, { ses: service() });
    const snsId = await event(id, 'Delivery', { delivery: { smtpResponse: '250 accepted' } });
    await event(id, 'Delivery', { delivery: { smtpResponse: '250 accepted' } }, snsId);
    const rows = await msgDb.db.query<any>(`SELECT * FROM deliveries WHERE message_id = $1 AND details LIKE 'SES Delivery:%'`, [id]);
    expect(rows).toHaveLength(1); expect(await status(id)).toBe('Sent');
  });

  it('suppresses permanent bounces and never lets a late delivery erase them', async () => {
    const id = await queue(domains['eu-west-1'], 'bounced@recipient.test');
    await processQueuedMessagesJob(config, { ses: service() });
    await event(id, 'Bounce', { bounce: { bounceType: 'Permanent', bounceSubType: 'General',
      bouncedRecipients: [{ emailAddress: 'bounced@recipient.test', diagnosticCode: '550 no such user' }] } });
    expect(await status(id)).toBe('Bounced');
    expect(await msgDb.db.get(`SELECT 1 FROM suppressions WHERE address = 'bounced@recipient.test'`)).toBeDefined();
    await event(id, 'Delivery', { delivery: { smtpResponse: '250 accepted' } });
    expect(await status(id)).toBe('Bounced');
    const later = await queue(domains['eu-west-1'], 'bounced@recipient.test');
    await processQueuedMessagesJob(config, { ses: service() });
    expect(await status(later)).toBe('Held'); expect(await receipt(later)).toBeUndefined();
  });

  it('suppresses complaints but leaves transient bounce recipients unsuppressed', async () => {
    const complaint = await queue(domains['eu-west-1'], 'complaint@recipient.test');
    const transient = await queue(domains['eu-west-1'], 'temporary@recipient.test');
    await processQueuedMessagesJob(config, { ses: service() });
    await event(complaint, 'Complaint', { complaint: { complaintFeedbackType: 'abuse', complainedRecipients: [{ emailAddress: 'complaint@recipient.test' }] } });
    await event(transient, 'Bounce', { bounce: { bounceType: 'Transient', bouncedRecipients: [{ emailAddress: 'temporary@recipient.test' }] } });
    expect(await msgDb.db.get(`SELECT 1 FROM suppressions WHERE address = 'complaint@recipient.test'`)).toBeDefined();
    expect(await msgDb.db.get(`SELECT 1 FROM suppressions WHERE address = 'temporary@recipient.test'`)).toBeUndefined();
  });

  it('records SES delivery delays without resubmitting accepted mail', async () => {
    const id = await queue(domains['eu-west-1'], 'delay@recipient.test');
    await processQueuedMessagesJob(config, { ses: service() });
    await event(id, 'DeliveryDelay');
    expect(await status(id)).toBe('SoftFail');
    expect(await getMainDb(config).get('SELECT 1 FROM queued_messages WHERE message_id = $1', [id])).toBeUndefined();
  });

  it('keeps an event pending when its provider receipt has not arrived', async () => {
    const snsId = crypto.randomUUID();
    await enqueueSesEvent(getMainDb(config), topic('eu-west-1'), snsId,
      { eventType: 'Delivery', mail: { messageId: 'not-yet-stored', timestamp: new Date().toISOString() } });
    await processSesEventsJob(config);
    const row = await getMainDb(config).get<any>('SELECT * FROM ses_event_inbox WHERE sns_message_id = $1', [snsId]);
    expect(row.processed_at).toBeNull(); expect(row.attempts).toBe(1); expect(row.error).toContain('receipt');
  });

  it('continues forwarding incoming mail to HTTP endpoints without consulting SES', async () => {
    const received: string[] = [];
    const endpointServer = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
      received.push(await request.text()); return new Response('OK');
    } });
    const db = getMainDb(config);
    const domain = domains['us-east-1'];
    const provider = config.posta.delivery_provider;
    config.posta.allowed_request_destinations = ['127.0.0.1'];
    try {
      await db.run('UPDATE domains SET verified_at = NULL WHERE id = $1', [domain.id]);
      const endpoint = await db.get<any>(`INSERT INTO http_endpoints(server_id, uuid, url, format, encoding)
        VALUES ($1, $2, $3, 'RawMessage', 'Base64') RETURNING id`, [serverId, crypto.randomUUID(), `http://127.0.0.1:${endpointServer.port}/inbound`]);
      const route = await db.get<any>(`INSERT INTO routes(server_id, domain_id, uuid, name, endpoint_type, endpoint_id, mode)
        VALUES ($1, $2, $3, 'support', 'HTTPEndpoint', $4, 'Deliver') RETURNING id`, [serverId, domain.id, crypto.randomUUID(), endpoint.id]);
      const raw = await new MessageStore(msgDb).insertRawMessage('From: person@external.test\r\nTo: support@american.test\r\nSubject: inbound\r\n\r\nhello');
      const id = await new MessageStore(msgDb).create({ scope: 'incoming', rcpt_to: 'support@american.test', mail_from: 'person@external.test',
        domain_id: domain.id, route_id: route.id, subject: 'inbound', status: 'Pending',
        raw_table: raw.tableName, raw_headers_id: raw.headersId, raw_body_id: raw.bodyId });
      await createQueuedMessage(db, { serverId, messageId: id });
      const ses = new SesService(config, () => ({ async send() { throw new Error('SES must not be called for inbound routing'); } }));
      await processQueuedMessagesJob(config, { ses });
      expect(received).toHaveLength(1); expect(await status(id)).toBe('Sent');
    } finally {
      endpointServer.stop(true);
      config.posta.delivery_provider = provider;
      await db.run('UPDATE domains SET verified_at = NOW() WHERE id = $1', [domain.id]);
    }
  });

  it('durably ingests allowed SQS envelopes and rejects foreign topics', async () => {
    const commands: any[] = [];
    const snsId = crypto.randomUUID();
    const fakeSqs = { async send(command: any) {
      commands.push(command);
      if (command.constructor.name === 'ReceiveMessageCommand') return { Messages: [
        { MessageId: 'allowed', ReceiptHandle: 'allowed-handle', Body: JSON.stringify({ Type: 'Notification', TopicArn: topic('eu-west-1'), MessageId: snsId,
          Message: JSON.stringify({ eventType: 'Delivery', mail: { messageId: 'queue-event', timestamp: new Date().toISOString() } }) }) },
        { MessageId: 'foreign', ReceiptHandle: 'foreign-handle', Body: JSON.stringify({ Type: 'Notification', TopicArn: 'foreign', MessageId: 'foreign-id', Message: '{}' }) },
      ] };
      return {};
    } };
    await pollSesQueue(config, fakeSqs, 0);
    expect(await getMainDb(config).get('SELECT 1 FROM ses_event_inbox WHERE sns_message_id = $1', [snsId])).toBeDefined();
    expect(await getMainDb(config).get(`SELECT 1 FROM ses_event_inbox WHERE sns_message_id = 'foreign-id'`)).toBeUndefined();
    expect(commands[1].input.Entries).toHaveLength(2);
  });
  it('does not acknowledge an SQS event if durable ingestion fails', async () => {
    const commands: any[] = [];
    const fakeSqs = { async send(command: any) {
      commands.push(command);
      return { Messages: [{ ReceiptHandle: 'retry-handle', Body: JSON.stringify({ Type: 'Notification', TopicArn: topic('eu-west-1'),
        MessageId: 'ingestion-failure', Message: JSON.stringify({ eventType: 'Delivery', mail: { messageId: 'provider-id', timestamp: new Date().toISOString() } }) }) }] };
    } };
    const failedDb = Object.create(getMainDb(config));
    failedDb.run = async () => { throw new Error('Database unavailable'); };
    await pollSesQueue(config, fakeSqs, 0, failedDb);
    expect(commands.map((c) => c.constructor.name)).toEqual(['ReceiveMessageCommand']);
  });

});

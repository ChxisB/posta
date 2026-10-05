import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  PgClient, closeAllDatabases, getMainDb, getServerDb, initializeMainDb, loadConfig, type PostaConfig,
} from '@posta/core';
import { InboundRejectedError, SesInboundStore, SesService, enqueueSesEvent, parseSesReceipt } from '@posta/aws';
import { MessageDbProvisioner, MessageStore, type MessageDatabase } from '@posta/message-db';
import { processQueuedMessagesJob } from '../jobs/process_queued_messages';
import { pollSesQueue, processSesEventsJob } from '../ses-events';
import { ingestSesReceipt, processSesInboundJob } from '../ses-inbound';

const url = 'postgresql://postgres:postgres@localhost:5432';
const database = `posta_test_ses_inbound_${Date.now()}`;
const bucket = 'posta-inbound-eu';
const topic = 'arn:aws:sns:eu-west-1:123456789012:posta-events';

let config: PostaConfig;
let serverId: number;
let otherServerId: number;
let msgDb: MessageDatabase;
let otherMsgDb: MessageDatabase;
const routes: Record<string, number> = {};

// A stand-in for S3: raw objects by bucket/key, and a record of what was asked of it.
const objects = new Map<string, Buffer>();
const s3Calls: Array<{ region: string; command: string; key: string }> = [];
let s3Failure: { name: string; message: string } | null = null;
let counter = 0;

function store(): SesInboundStore {
  return new SesInboundStore(config, (region) => ({
    async send(command: any) {
      const { Bucket, Key } = command.input;
      s3Calls.push({ region, command: command.constructor.name, key: Key });
      if (command.constructor.name === 'GetObjectCommand') {
        if (s3Failure) { const error = new Error(s3Failure.message); error.name = s3Failure.name; throw error; }
        const bytes = objects.get(`${Bucket}/${Key}`);
        if (!bytes) { const error = new Error('The specified key does not exist.'); error.name = 'NoSuchKey'; throw error; }
        return { ContentLength: bytes.length, Body: { transformToByteArray: async () => new Uint8Array(bytes) } };
      }
      objects.delete(`${Bucket}/${Key}`);
      return {};
    },
  }));
}
const fetches = (key?: string) => s3Calls.filter((c) => c.command === 'GetObjectCommand' && (!key || c.key === key)).length;

interface Options { spam?: string; virus?: string; bucket?: string; prefix?: string; subject?: string; store?: boolean }
/** A "Received" notification for mail SES has already written to the bucket. */
function received(recipients: string[], options: Options = {}) {
  const id = `ses-${Date.now().toString(36)}-${++counter}`;
  const key = `${options.prefix ?? 'inbound/'}${id}`;
  if (options.store !== false) {
    objects.set(`${bucket}/${key}`, Buffer.from(`From: Sender <sender@external.test>\r\nTo: ${recipients[0]}\r\n`
      + `Subject: ${options.subject ?? 'Hello'}\r\nMessage-ID: <${id}@external.test>\r\n\r\nBody with café 📬`, 'utf8'));
  }
  const payload = {
    notificationType: 'Received',
    mail: { messageId: id, source: 'sender@external.test', timestamp: new Date().toISOString() },
    receipt: { recipients, spamVerdict: { status: options.spam ?? 'PASS' }, virusVerdict: { status: options.virus ?? 'PASS' },
      action: { type: 'S3', topicArn: topic, bucketName: options.bucket ?? bucket, objectKey: key } },
  };
  return { id, key, payload, receipt: parseSesReceipt(payload)! };
}

const noSes = () => new SesService(config, () => ({ async send() { throw new Error('SES must not be called for inbound mail'); } }));
async function drainQueue() { while (await processQueuedMessagesJob(config, { ses: noSes() })) { /* until empty */ } }
const messages = (rcpt: string, db = msgDb) => db.db.query<any>(`SELECT * FROM messages WHERE rcpt_to = $1 ORDER BY id`, [rcpt]);
const queued = (id: number, server = serverId) => getMainDb(config).get('SELECT 1 FROM queued_messages WHERE server_id = $1 AND message_id = $2', [server, id]);
const inbox = (snsId: string) => getMainDb(config).get<any>('SELECT * FROM ses_event_inbox WHERE sns_message_id = $1', [snsId]);

beforeAll(async () => {
  const admin = new PgClient(`${url}/postgres`);
  await admin.exec(`CREATE DATABASE ${database}`); await admin.close();
  await closeAllDatabases();
  config = loadConfig('/dev/null');
  config.main_db.url = `${url}/${database}`;
  config.message_db.url = config.main_db.url;
  config.posta.delivery_provider = 'ses';
  config.posta.inbound_provider = 'ses';
  config.posta.use_ip_pools = false;
  config.aws = { region: 'us-east-1', regions: ['us-east-1', 'eu-west-1'], configuration_set: 'posta',
    sns_topic_arns: [topic], sqs_queue_url: 'https://sqs.eu-west-1.amazonaws.com/123456789012/posta-events',
    max_send_rate: 1000, mail_from_subdomain: 'bounce', inbound_buckets: { 'eu-west-1': bucket }, inbound_prefix: 'inbound/' };
  const db = await initializeMainDb(config);

  const org = await db.get<any>(`INSERT INTO organizations(uuid, name, permalink) VALUES ($1, 'Inbound', 'inbound') RETURNING id`, [crypto.randomUUID()]);
  const server = async (name: string) => (await db.get<any>(`INSERT INTO servers(uuid, organization_id, name, mode) VALUES ($1, $2, $3, 'Live') RETURNING id`,
    [crypto.randomUUID(), org.id, name])).id as number;
  serverId = await server('Main'); otherServerId = await server('Other');

  const domain = async (server_id: number, name: string, inboundRegion: string | null, verified = true) =>
    (await db.get<any>(`INSERT INTO domains(uuid, server_id, name, ses_region, ses_inbound_region, verified_at, inbound_verified_at, incoming)
      VALUES ($1, $2, $3, 'us-east-1', $4, NOW(), ${verified ? 'NOW()' : 'NULL'}, 1) RETURNING id`, [crypto.randomUUID(), server_id, name, inboundRegion])).id as number;
  const route = async (key: string, server_id: number, domain_id: number, name: string, mode = 'Accept', spamMode: string | null = null) => {
    routes[key] = (await db.get<any>(`INSERT INTO routes(server_id, domain_id, uuid, name, mode, spam_mode) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [server_id, domain_id, crypto.randomUUID(), name, mode, spamMode])).id;
  };
  const acme = await domain(serverId, 'acme.test', 'eu-west-1');
  await route('support', serverId, acme, 'support'); await route('catchall', serverId, acme, '*');
  await route('quarantine', serverId, acme, 'quarantine', 'Accept', 'Quarantine');
  const second = await domain(otherServerId, 'second.test', 'eu-west-1');
  await route('second', otherServerId, second, '*');
  const smtp = await domain(serverId, 'smtp-mx.test', null); await route('smtp', serverId, smtp, '*');
  const elsewhere = await domain(serverId, 'elsewhere.test', 'us-east-1'); await route('elsewhere', serverId, elsewhere, '*');
  const unverified = await domain(serverId, 'unverified.test', 'eu-west-1', false); await route('unverified', serverId, unverified, '*');

  const provisioner = new MessageDbProvisioner(config);
  msgDb = await provisioner.openServerDb(serverId, getServerDb(config, serverId));
  otherMsgDb = await provisioner.openServerDb(otherServerId, getServerDb(config, otherServerId));
});

afterAll(async () => {
  await closeAllDatabases();
  const admin = new PgClient(`${url}/postgres`);
  await admin.exec(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`); await admin.close();
});

describe('SES inbound ingest', () => {
  it('stores one message per recipient through the route that claims it, and queues them', async () => {
    const mail = received(['support@acme.test', 'Sales+promo@acme.test']);
    const result = await ingestSesReceipt(config, topic, mail.receipt, store());
    expect(result).toEqual({ stored: 2, skipped: 0 });

    const [support] = await messages('support@acme.test');
    const [sales] = await messages('sales+promo@acme.test');
    expect(support).toMatchObject({ scope: 'incoming', mail_from: 'sender@external.test', subject: 'Hello',
      message_id: `<${mail.id}@external.test>`, route_id: routes.support, status: 'Pending' });
    // A +tag is ignored when choosing the route, and the unnamed local part falls to the catch-all.
    expect(sales.route_id).toBe(routes.catchall);
    expect(support.domain_id).toBe(sales.domain_id);
    expect(await queued(support.id)).toBeDefined(); expect(await queued(sales.id)).toBeDefined();

    // The mail is read once for both recipients, kept byte for byte, and removed from the bucket.
    expect(s3Calls.filter((c) => c.key === mail.key).map((c) => c.command)).toEqual(['GetObjectCommand', 'DeleteObjectCommand']);
    const raw = await new MessageStore(msgDb).getRawMessage(support);
    expect(Buffer.from(raw, 'binary').toString('utf8')).toContain('café 📬');
    expect(objects.has(`${bucket}/${mail.key}`)).toBe(false);
  });

  it('is safe to run again: a repeated notification stores nothing twice and does not read S3 again', async () => {
    const mail = received(['support@acme.test']);
    await ingestSesReceipt(config, topic, mail.receipt, store());
    const reads = fetches();
    // The object is gone by now, so a second read would fail rather than quietly succeed.
    expect(await ingestSesReceipt(config, topic, mail.receipt, store())).toEqual({ stored: 0, skipped: 0 });
    expect(fetches()).toBe(reads);
    const rows = (await messages('support@acme.test')).filter((m) => m.message_id === `<${mail.id}@external.test>`);
    expect(rows).toHaveLength(1);
  });

  it('stores a message once when two workers ingest the same notification at the same time', async () => {
    const mail = received(['race@acme.test']);
    await Promise.all([ingestSesReceipt(config, topic, mail.receipt, store()), ingestSesReceipt(config, topic, mail.receipt, store())]);
    expect(await messages('race@acme.test')).toHaveLength(1);
    const [row] = await messages('race@acme.test');
    expect(await getMainDb(config).query('SELECT 1 FROM queued_messages WHERE server_id = $1 AND message_id = $2', [serverId, row.id])).toHaveLength(1);
  });

  it('finishes a hand-off to the queue that an earlier attempt did not complete', async () => {
    const mail = received(['crash@acme.test']);
    await ingestSesReceipt(config, topic, mail.receipt, store());
    const [row] = await messages('crash@acme.test');
    // As if the worker died after committing the message but before queueing it.
    await getMainDb(config).run('DELETE FROM queued_messages WHERE server_id = $1 AND message_id = $2', [serverId, row.id]);
    await msgDb.db.run('UPDATE ses_inbound_receipts SET queued_at = NULL WHERE ses_message_id = $1', [mail.id]);

    await ingestSesReceipt(config, topic, mail.receipt, store());
    expect(await messages('crash@acme.test')).toHaveLength(1);
    expect(await queued(row.id)).toBeDefined();
    expect((await msgDb.db.get<any>('SELECT queued_at FROM ses_inbound_receipts WHERE ses_message_id = $1', [mail.id])).queued_at).not.toBeNull();
  });

  it('does not queue again a message that was already handled before the receipt was marked', async () => {
    const mail = received(['handled@acme.test']);
    await ingestSesReceipt(config, topic, mail.receipt, store());
    const [row] = await messages('handled@acme.test');
    await drainQueue();
    expect((await messages('handled@acme.test'))[0].status).toBe('Processed');
    await msgDb.db.run('UPDATE ses_inbound_receipts SET queued_at = NULL WHERE ses_message_id = $1', [mail.id]);

    await ingestSesReceipt(config, topic, mail.receipt, store());
    expect(await queued(row.id)).toBeUndefined();
    expect((await msgDb.db.get<any>('SELECT queued_at FROM ses_inbound_receipts WHERE ses_message_id = $1', [mail.id])).queued_at).not.toBeNull();
  });

  it('splits a message across the servers whose routes claim its recipients, reading S3 once', async () => {
    const mail = received(['support@acme.test', 'anyone@second.test']);
    expect(await ingestSesReceipt(config, topic, mail.receipt, store())).toEqual({ stored: 2, skipped: 0 });
    expect(fetches(mail.key)).toBe(1);
    const mine = (await messages('support@acme.test')).filter((m) => m.message_id === `<${mail.id}@external.test>`);
    const [theirs] = await messages('anyone@second.test', otherMsgDb);
    expect(mine).toHaveLength(1); expect(theirs.route_id).toBe(routes.second);
    expect(await queued(theirs.id, otherServerId)).toBeDefined();
  });

  it('takes only recipients whose domain names this region, is verified and has a route', async () => {
    const mail = received(['x@smtp-mx.test', 'x@elsewhere.test', 'x@unverified.test', 'x@unknown.test', 'kept@acme.test']);
    expect(await ingestSesReceipt(config, topic, mail.receipt, store())).toEqual({ stored: 1, skipped: 4 });
    for (const rcpt of ['x@smtp-mx.test', 'x@elsewhere.test', 'x@unverified.test', 'x@unknown.test']) {
      expect(await messages(rcpt)).toHaveLength(0);
    }
    expect(await messages('kept@acme.test')).toHaveLength(1);
  });

  it('refuses a notification that names a bucket or object outside the configured location, without reading anything', async () => {
    const reads = fetches();
    const forged = received(['support@acme.test'], { bucket: 'attacker-bucket' });
    await expect(ingestSesReceipt(config, topic, forged.receipt, store())).rejects.toBeInstanceOf(InboundRejectedError);
    const outside = received(['support@acme.test'], { prefix: 'private/' });
    await expect(ingestSesReceipt(config, topic, outside.receipt, store())).rejects.toBeInstanceOf(InboundRejectedError);
    const traversal = received(['support@acme.test'], { prefix: 'inbound/../private/' });
    await expect(ingestSesReceipt(config, topic, traversal.receipt, store())).rejects.toBeInstanceOf(InboundRejectedError);
    const foreignRegion = received(['support@acme.test']);
    await expect(ingestSesReceipt(config, 'arn:aws:sns:ap-south-1:123456789012:posta-events', foreignRegion.receipt, store())).rejects.toBeInstanceOf(InboundRejectedError);
    expect(fetches()).toBe(reads);
    expect(await messages('support@acme.test')).not.toContainEqual(expect.objectContaining({ message_id: `<${forged.id}@external.test>` }));
  });
});

describe('SES verdicts', () => {
  it('records an SES spam FAIL as one more spam check, so a route can quarantine the message', async () => {
    const mail = received(['quarantine@acme.test'], { spam: 'FAIL' });
    await ingestSesReceipt(config, topic, mail.receipt, store());
    const [row] = await messages('quarantine@acme.test');
    const checks = await msgDb.db.query<any>('SELECT * FROM spam_checks WHERE message_id = $1', [row.id]);
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ code: 'SES_SPAM_VERDICT', score: config.posta.default_spam_threshold + 1 });

    await drainQueue();
    const [after] = await messages('quarantine@acme.test');
    expect(after).toMatchObject({ spam: 1, status: 'Held' });
    expect(after.spam_score).toBe(config.posta.default_spam_threshold + 1);
    // The check SES recorded survives inspection.
    expect(await msgDb.db.query('SELECT 1 FROM spam_checks WHERE message_id = $1 AND code = \'SES_SPAM_VERDICT\'', [row.id])).toHaveLength(1);
  });

  it('does not mark mail SES passed as spam', async () => {
    const mail = received(['quarantine@acme.test'], { spam: 'PASS', subject: 'Passed' });
    await ingestSesReceipt(config, topic, mail.receipt, store());
    const row = (await messages('quarantine@acme.test')).find((m) => m.subject === 'Passed');
    expect(await msgDb.db.query('SELECT 1 FROM spam_checks WHERE message_id = $1', [row.id])).toHaveLength(0);
    await drainQueue();
    const after = (await messages('quarantine@acme.test')).find((m) => m.subject === 'Passed');
    expect(after).toMatchObject({ spam: 0, status: 'Processed' });
  });

  it('keeps an SES virus FAIL as a threat through inspection', async () => {
    const mail = received(['virus@acme.test'], { virus: 'FAIL' });
    await ingestSesReceipt(config, topic, mail.receipt, store());
    const [row] = await messages('virus@acme.test');
    expect(row).toMatchObject({ threat: 1, threat_details: 'Amazon SES virus scan flagged this message' });
    await drainQueue();
    expect((await messages('virus@acme.test'))[0]).toMatchObject({ threat: 1, threat_details: 'Amazon SES virus scan flagged this message', inspected: 1 });
  });
});

describe('SES inbound job', () => {
  it('claims received mail from the inbox, while the event job leaves it alone', async () => {
    const mail = received(['job@acme.test']);
    await enqueueSesEvent(getMainDb(config), topic, mail.id, mail.payload);
    expect((await inbox(mail.id)).kind).toBe('inbound');

    expect(await processSesEventsJob(config)).toBe(false);
    expect((await inbox(mail.id)).attempts).toBe(0);

    expect(await processSesInboundJob(config, store())).toBe(true);
    expect((await inbox(mail.id)).processed_at).not.toBeNull();
    expect(await messages('job@acme.test')).toHaveLength(1);
    expect(await processSesInboundJob(config, store())).toBe(false);
  });

  it('tells send feedback from received mail and ignores anything else', async () => {
    const db = getMainDb(config);
    const feedback = crypto.randomUUID();
    expect(await enqueueSesEvent(db, topic, feedback, { eventType: 'Delivery', mail: { messageId: 'x', timestamp: new Date().toISOString() } })).toBe(true);
    expect((await inbox(feedback)).kind).toBe('event');
    expect(await enqueueSesEvent(db, topic, crypto.randomUUID(), { notificationType: 'Received', mail: { messageId: 'x' } })).toBe(false);
    expect(await enqueueSesEvent(db, topic, crypto.randomUUID(), { hello: 'world' })).toBe(false);
  });

  it('retries a transient failure later, and succeeds once S3 recovers', async () => {
    const mail = received(['retry@acme.test']);
    await enqueueSesEvent(getMainDb(config), topic, mail.id, mail.payload);
    s3Failure = { name: 'ServiceUnavailable', message: 'S3 is unavailable' };
    expect(await processSesInboundJob(config, store())).toBe(true);
    let row = await inbox(mail.id);
    expect(row).toMatchObject({ processed_at: null, attempts: 1, error: 'S3 is unavailable' });
    expect(new Date(row.retry_after).getTime()).toBeGreaterThan(Date.now());
    expect(await messages('retry@acme.test')).toHaveLength(0);
    // Not claimed again until its retry time.
    expect(await processSesInboundJob(config, store())).toBe(false);

    s3Failure = null;
    await getMainDb(config).run('UPDATE ses_event_inbox SET retry_after = NOW() WHERE sns_message_id = $1', [mail.id]);
    expect(await processSesInboundJob(config, store())).toBe(true);
    row = await inbox(mail.id);
    expect(row).toMatchObject({ error: null, attempts: 2 }); expect(row.processed_at).not.toBeNull();
    expect(await messages('retry@acme.test')).toHaveLength(1);
  });

  it('drops mail that retrying cannot fix: a forged location or an object that is gone', async () => {
    const forged = received(['drop@acme.test'], { bucket: 'attacker-bucket' });
    const vanished = received(['drop@acme.test'], { store: false });
    for (const mail of [forged, vanished]) await enqueueSesEvent(getMainDb(config), topic, mail.id, mail.payload);
    await processSesInboundJob(config, store()); await processSesInboundJob(config, store());
    expect((await inbox(forged.id)).processed_at).not.toBeNull(); expect((await inbox(forged.id)).error).toContain('bucket');
    expect((await inbox(vanished.id)).processed_at).not.toBeNull(); expect((await inbox(vanished.id)).error).toContain('no longer');
    expect(await messages('drop@acme.test')).toHaveLength(0);
  });

  it('leaves a row claimed by a worker that died alone until its lease runs out, then takes it over', async () => {
    const mail = received(['lease@acme.test']);
    const db = getMainDb(config);
    await enqueueSesEvent(db, topic, mail.id, mail.payload);
    // What a claim leaves behind if the worker never finishes: one attempt used and a lease in the future.
    await db.run(`UPDATE ses_event_inbox SET attempts = 1, retry_after = NOW() + INTERVAL '5 minutes' WHERE sns_message_id = $1`, [mail.id]);
    expect(await processSesInboundJob(config, store())).toBe(false);
    expect(fetches(mail.key)).toBe(0);

    await db.run(`UPDATE ses_event_inbox SET retry_after = NOW() - INTERVAL '1 second' WHERE sns_message_id = $1`, [mail.id]);
    expect(await processSesInboundJob(config, store())).toBe(true);
    expect((await inbox(mail.id)).attempts).toBe(2);
    expect(await messages('lease@acme.test')).toHaveLength(1);
  });

  it('takes received mail off the shared SQS queue into the inbox', async () => {
    const mail = received(['queue@acme.test']);
    const commands: any[] = [];
    const sqs = { async send(command: any) {
      commands.push(command);
      if (command.constructor.name === 'ReceiveMessageCommand') return { Messages: [
        { MessageId: 'm1', ReceiptHandle: 'h1', Body: JSON.stringify({ Type: 'Notification', TopicArn: topic, MessageId: mail.id, Message: JSON.stringify(mail.payload) }) },
      ] };
      return {};
    } };
    await pollSesQueue(config, sqs, 0);
    expect((await inbox(mail.id)).kind).toBe('inbound');
    expect(commands[1].input.Entries).toHaveLength(1);
    await processSesInboundJob(config, store());
    expect(await messages('queue@acme.test')).toHaveLength(1);
  });
});

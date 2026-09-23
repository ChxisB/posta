import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import net from 'node:net';
import {
  PgClient,
  closeAllDatabases,
  createQueuedMessage,
  getMainDb,
  getServerDb,
  initializeMainDb,
  loadConfig,
  type PostaConfig,
} from '@posta/core';
import { MessageDbProvisioner, MessageStore, type MessageDatabase } from '@posta/message-db';
import { processQueuedMessagesJob } from '../jobs/process_queued_messages';

/**
 * What the worker does with the receiving server's answer, end to end: a
 * queued message is delivered through the real job to a loopback relay, and
 * the outcome is read back from the database.
 *
 * Needs Postgres on localhost:5432 (postgres/postgres), as the web-server's
 * route tests do.
 */

const SERVER_URL = 'postgresql://postgres:postgres@localhost:5432';
const DB_NAME = `posta_test_worker_delivery_${Date.now()}`;

// Test files share a process, so put these back for the files that run after.
const ENV_KEYS = ['POSTA_MAIN_DB_URL', 'POSTA_MESSAGE_DB_URL', 'POSTA_CONFIG_FILE_PATH', 'POSTA_SMTP_RELAYS'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

/** A relay that answers RCPT TO with whatever the current test sets. */
const relay = {
  port: 0,
  rcptReply: '250 2.1.5 Ok',
  connections: 0,
  server: null as net.Server | null,
  sockets: new Set<net.Socket>(),
};

function startRelay(): Promise<void> {
  relay.server = net.createServer((socket) => {
    relay.sockets.add(socket);
    socket.on('close', () => relay.sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    relay.connections++;
    let buffer = '';
    let inData = false;
    let rcptAccepted = false;

    socket.write('220 relay.test ESMTP\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      let out = '';
      let i: number;
      while ((i = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);

        if (inData) {
          if (line === '.') {
            inData = false;
            out += '250 2.0.0 Ok: queued\r\n';
          }
          continue;
        }

        const verb = line.slice(0, 4).toUpperCase();
        if (verb === 'EHLO') out += '250-relay.test\r\n250 PIPELINING\r\n';
        else if (verb === 'RCPT') {
          rcptAccepted = relay.rcptReply.startsWith('2');
          out += `${relay.rcptReply}\r\n`;
        } else if (verb === 'DATA') {
          if (rcptAccepted) {
            inData = true;
            out += '354 Go ahead\r\n';
          } else {
            out += '554 5.5.1 No valid recipients\r\n';
          }
        } else if (verb === 'QUIT') out += '221 Bye\r\n';
        else out += '250 Ok\r\n';
      }
      if (out) socket.write(out);
    });
  });

  return new Promise((resolve) => {
    relay.server!.listen(0, '127.0.0.1', () => {
      const address = relay.server!.address();
      relay.port = typeof address === 'object' && address ? address.port : 0;
      resolve();
    });
  });
}

let config: PostaConfig;
let serverId: number;
let msgDb: MessageDatabase;

const MESSAGE = 'From: app@posta.test\r\nTo: someone@remote.test\r\nSubject: x\r\n\r\nhello';

/** Store and queue one outgoing message, as the send API does. */
async function queue(rcptTo: string): Promise<number> {
  const store = new MessageStore(msgDb);
  const raw = await store.insertRawMessage(MESSAGE);
  const messageId = await store.create({
    scope: 'outgoing',
    rcpt_to: rcptTo,
    mail_from: 'app@posta.test',
    subject: 'x',
    message_id: `<${crypto.randomUUID()}@posta.test>`,
    raw_table: raw.tableName,
    raw_headers_id: raw.headersId,
    raw_body_id: raw.bodyId,
    status: 'Pending',
    received_with_ssl: false,
    bounce: false,
  });
  await createQueuedMessage(getMainDb(config), { serverId, messageId });
  return messageId;
}

async function messageStatus(id: number): Promise<string> {
  const rows = await msgDb.query(`SELECT status FROM messages WHERE id = $1`, [id]) as any[];
  return rows[0]?.status;
}

async function deliveries(id: number): Promise<Array<{ status: string; details: string }>> {
  return await msgDb.query(
    `SELECT status, details FROM deliveries WHERE message_id = $1 ORDER BY id`,
    [id],
  ) as any[];
}

async function queued(id: number): Promise<any> {
  return getMainDb(config).get(`SELECT * FROM queued_messages WHERE message_id = $1`, [id]);
}

async function suppression(address: string): Promise<any> {
  const rows = await msgDb.query(
    `SELECT * FROM suppressions WHERE type = 'recipient' AND address = $1`,
    [address],
  ) as any[];
  return rows[0];
}

beforeAll(async () => {
  const admin = new PgClient(`${SERVER_URL}/postgres`);
  try {
    await admin.exec(`CREATE DATABASE ${DB_NAME}`);
  } finally {
    await admin.close();
  }

  await startRelay();

  process.env.POSTA_MAIN_DB_URL = `${SERVER_URL}/${DB_NAME}`;
  process.env.POSTA_MESSAGE_DB_URL = `${SERVER_URL}/${DB_NAME}`;
  process.env.POSTA_CONFIG_FILE_PATH = '/dev/null';
  process.env.POSTA_SMTP_RELAYS = JSON.stringify([
    { host: '127.0.0.1', port: relay.port, ssl_mode: 'None' },
  ]);

  // getMainDb caches its connection for the process, so drop any left over
  // from another test file before pointing it at this database.
  await closeAllDatabases();
  config = loadConfig();
  const mainDb = await initializeMainDb(config);

  const org = await mainDb.get<{ id: number }>(
    `INSERT INTO organizations (uuid, name, permalink) VALUES ($1, 'Acme', 'acme') RETURNING id`,
    [crypto.randomUUID()],
  );
  const server = await mainDb.get<{ id: number }>(
    `INSERT INTO servers (organization_id, uuid, name, permalink, mode)
     VALUES ($1, $2, 'Main', 'main', 'Live') RETURNING id`,
    [org!.id, crypto.randomUUID()],
  );
  serverId = server!.id;

  const provisioner = new MessageDbProvisioner(config);
  msgDb = await provisioner.openServerDb(serverId, getServerDb(config, serverId));
});

afterAll(async () => {
  for (const socket of relay.sockets) socket.destroy();
  await new Promise<void>((done) => relay.server?.close(() => done()) ?? done());
  await closeAllDatabases();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const admin = new PgClient(`${SERVER_URL}/postgres`);
  try {
    await admin.exec(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  } finally {
    await admin.close();
  }
});

describe('outgoing delivery', () => {
  it('marks an accepted message Sent and removes it from the queue', async () => {
    relay.rcptReply = '250 2.1.5 Ok';
    const id = await queue('ok@remote.test');

    await processQueuedMessagesJob(config);

    expect(await messageStatus(id)).toBe('Sent');
    expect(await queued(id)).toBeUndefined();
  });

  it('keeps a message deferred at RCPT queued for a retry', async () => {
    // The regression: a 452 was recorded as Sent and the queue entry deleted,
    // so the message was lost with nothing left to retry it.
    relay.rcptReply = '452 4.2.2 Mailbox full';
    const id = await queue('full@remote.test');

    await processQueuedMessagesJob(config);

    expect(await messageStatus(id)).toBe('SoftFail');
    expect((await deliveries(id))[0].details).toBe('452 4.2.2 Mailbox full');
    const entry = await queued(id);
    expect(entry).toBeDefined();
    expect(entry.retry_after).not.toBeNull();
    expect(entry.locked_by).toBeNull();
    expect(await suppression('full@remote.test')).toBeUndefined();
  });

  it('fails a message rejected at RCPT and suppresses the address', async () => {
    // The regression: a 550 was retried as a soft fail for days, and nothing
    // ever wrote to the suppression list.
    relay.rcptReply = '550 5.1.1 No such user';
    const id = await queue('gone@remote.test');

    await processQueuedMessagesJob(config);

    expect(await messageStatus(id)).toBe('HardFail');
    expect((await deliveries(id))[0].details).toBe('550 5.1.1 No such user');
    expect(await queued(id)).toBeUndefined();

    const entry = await suppression('gone@remote.test');
    expect(entry).toBeDefined();
    expect(entry.reason).toBe('550 5.1.1 No such user');
    expect(entry.keep_until).toBeGreaterThan(Date.now() / 1000);
  });

  it('holds the next message to a suppressed address without contacting the relay', async () => {
    // Relies on the suppression written by the previous test.
    relay.rcptReply = '250 2.1.5 Ok';
    const before = relay.connections;
    const id = await queue('gone@remote.test');

    await processQueuedMessagesJob(config);

    const [delivery] = await deliveries(id);
    expect(delivery.status).toBe('Held');
    expect(delivery.details).toContain('suppression list');
    expect(relay.connections).toBe(before);
  });
});

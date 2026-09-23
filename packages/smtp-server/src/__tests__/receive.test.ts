import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import net from 'node:net';
import {
  PgClient,
  closeAllDatabases,
  getMainDb,
  getServerDb,
  initializeMainDb,
  loadConfig,
  type PostaConfig,
} from '@posta/core';
import { MessageDbProvisioner, MessageStore, type MessageDatabase } from '@posta/message-db';
import { SmtpServer } from '../server';
import { MessageQueuer } from '../queue-message';

/**
 * Mail received over SMTP, end to end: a real server on a loopback port,
 * a client speaking the protocol, and the stored messages read back from the
 * database.
 *
 * Needs Postgres on localhost:5432 (postgres/postgres), as the web-server's
 * route tests do.
 */

const SERVER_URL = 'postgresql://postgres:postgres@localhost:5432';
const DB_NAME = `posta_test_smtp_receive_${Date.now()}`;
const SMTP_KEY = 'test-smtp-key';

// Test files share a process, so put these back for the files that run after.
const ENV_KEYS = ['POSTA_MAIN_DB_URL', 'POSTA_MESSAGE_DB_URL', 'POSTA_CONFIG_FILE_PATH', 'SMTP_PORT', 'SMTP_BIND_ADDRESS'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

/** A minimal SMTP client that reads one whole reply at a time. */
class Client {
  private socket!: net.Socket;
  private buffer = '';
  private lines: string[] = [];
  private waiting: (() => void) | null = null;

  static async connect(port: number): Promise<Client> {
    const client = new Client();
    await new Promise<void>((resolve, reject) => {
      client.socket = net.connect(port, '127.0.0.1', resolve);
      client.socket.once('error', reject);
    });
    client.socket.on('data', (chunk) => {
      client.buffer += chunk.toString('latin1');
      let i: number;
      while ((i = client.buffer.indexOf('\r\n')) !== -1) {
        client.lines.push(client.buffer.slice(0, i));
        client.buffer = client.buffer.slice(i + 2);
      }
      client.waiting?.();
    });
    await client.reply(); // banner
    return client;
  }

  /** The next complete reply, with the lines of a multi-line one joined by \n. */
  async reply(): Promise<string> {
    const collected: string[] = [];
    while (true) {
      while (this.lines.length === 0) {
        await new Promise<void>((resolve) => { this.waiting = resolve; });
        this.waiting = null;
      }
      const line = this.lines.shift()!;
      collected.push(line);
      if (line[3] !== '-') return collected.join('\n');
    }
  }

  write(data: string | Buffer): void {
    this.socket.write(data);
  }

  async send(line: string): Promise<string> {
    this.write(`${line}\r\n`);
    return this.reply();
  }

  async authenticate(): Promise<void> {
    expect(await this.send('EHLO client.test')).toStartWith('250');
    const token = Buffer.from(`\0user\0${SMTP_KEY}`).toString('base64');
    expect(await this.send(`AUTH PLAIN ${token}`)).toStartWith('235');
  }

  close(): void {
    this.socket.destroy();
  }
}

let config: PostaConfig;
let smtp: SmtpServer;
let queuer: MessageQueuer;
let msgDb: MessageDatabase;
let serverId: number;
let credentialId: number;
let domainId: number;
let routeId: number;

function message(messageId: string, body = 'hello'): string {
  return [
    'From: App <app@posta.test>',
    'To: someone@remote.test',
    'Subject: Receipt',
    `Message-ID: ${messageId}`,
    '',
    body,
    '.',
    '',
  ].join('\r\n');
}

function newMessageId(): string {
  return `<${crypto.randomUUID()}@client.test>`;
}

async function stored(messageId: string): Promise<any[]> {
  return await msgDb.query(
    `SELECT * FROM messages WHERE message_id = $1 ORDER BY id`,
    [messageId],
  ) as any[];
}

async function queued(id: number): Promise<any> {
  return getMainDb(config).get(`SELECT * FROM queued_messages WHERE message_id = $1`, [id]);
}

async function messageCount(): Promise<number> {
  const rows = await msgDb.query(`SELECT count(*) AS n FROM messages`) as any[];
  return Number(rows[0].n);
}

beforeAll(async () => {
  const admin = new PgClient(`${SERVER_URL}/postgres`);
  try {
    await admin.exec(`CREATE DATABASE ${DB_NAME}`);
  } finally {
    await admin.close();
  }

  process.env.POSTA_MAIN_DB_URL = `${SERVER_URL}/${DB_NAME}`;
  process.env.POSTA_MESSAGE_DB_URL = `${SERVER_URL}/${DB_NAME}`;
  process.env.POSTA_CONFIG_FILE_PATH = '/dev/null';
  process.env.SMTP_PORT = '0';
  process.env.SMTP_BIND_ADDRESS = '127.0.0.1';

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

  const credential = await mainDb.get<{ id: number }>(
    `INSERT INTO credentials (server_id, key, type, name, uuid)
     VALUES ($1, $2, 'SMTP', 'App', $3) RETURNING id`,
    [serverId, SMTP_KEY, crypto.randomUUID()],
  );
  credentialId = credential!.id;

  const domain = await mainDb.get<{ id: number }>(
    `INSERT INTO domains (server_id, uuid, name, verified_at)
     VALUES ($1, $2, 'posta.test', NOW()) RETURNING id`,
    [serverId, crypto.randomUUID()],
  );
  domainId = domain!.id;

  const route = await mainDb.get<{ id: number }>(
    `INSERT INTO routes (uuid, server_id, domain_id, name, mode, spam_mode)
     VALUES ($1, $2, $3, 'support', 'Accept', 'Mark') RETURNING id`,
    [crypto.randomUUID(), serverId, domainId],
  );
  routeId = route!.id;

  // A route on a domain nobody has proved they own must not take mail.
  const unverified = await mainDb.get<{ id: number }>(
    `INSERT INTO domains (server_id, uuid, name) VALUES ($1, $2, 'unverified.test') RETURNING id`,
    [serverId, crypto.randomUUID()],
  );
  await mainDb.run(
    `INSERT INTO routes (uuid, server_id, domain_id, name, mode, spam_mode)
     VALUES ($1, $2, $3, '*', 'Accept', 'Mark')`,
    [crypto.randomUUID(), serverId, unverified!.id],
  );

  msgDb = await new MessageDbProvisioner(config).openServerDb(serverId, getServerDb(config, serverId));

  smtp = new SmtpServer(config);
  queuer = new MessageQueuer(config);
  smtp.onMessage = (msg) => queuer.queue(msg);
  smtp.start();
});

afterAll(async () => {
  smtp?.stop();
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

describe('receiving mail over SMTP', () => {
  it('stores and queues a submitted message once per recipient', async () => {
    // The regression: the 250 after DATA was sent but the message was never
    // stored, so everything submitted over SMTP was silently lost.
    const id = newMessageId();
    const client = await Client.connect(smtp.port);
    await client.authenticate();
    expect(await client.send('MAIL FROM:<app@posta.test>')).toBe('250 OK');
    expect(await client.send('RCPT TO:<one@remote.test>')).toBe('250 OK');
    expect(await client.send('RCPT TO:<two@remote.test>')).toBe('250 OK');
    expect(await client.send('DATA')).toStartWith('354');
    client.write(message(id));
    expect(await client.reply()).toBe('250 OK');
    client.close();

    const rows = await stored(id);
    expect(rows.map((r) => r.rcpt_to)).toEqual(['one@remote.test', 'two@remote.test']);
    for (const row of rows) {
      expect(row.scope).toBe('outgoing');
      expect(row.mail_from).toBe('app@posta.test');
      expect(row.subject).toBe('Receipt');
      expect(row.credential_id).toBe(credentialId);
      expect(row.domain_id).toBe(domainId);
      expect(row.status).toBe('Pending');
      expect(await queued(row.id)).toBeDefined();
    }
  });

  it('stores mail for a routed address as incoming', async () => {
    const id = newMessageId();
    const client = await Client.connect(smtp.port);
    expect(await client.send('EHLO sender.test')).toStartWith('250');
    expect(await client.send('MAIL FROM:<someone@sender.test>')).toBe('250 OK');
    expect(await client.send('RCPT TO:<Support+billing@POSTA.test>')).toBe('250 OK');
    expect(await client.send('DATA')).toStartWith('354');
    client.write(message(id));
    expect(await client.reply()).toBe('250 OK');
    client.close();

    const [row] = await stored(id);
    expect(row.scope).toBe('incoming');
    expect(row.route_id).toBe(routeId);
    expect(row.domain_id).toBe(domainId);
    expect(row.credential_id).toBeNull();
    expect(await queued(row.id)).toBeDefined();
  });

  it('refuses to relay for an unauthenticated client', async () => {
    const before = await messageCount();
    const client = await Client.connect(smtp.port);
    expect(await client.send('EHLO sender.test')).toStartWith('250');
    expect(await client.send('MAIL FROM:<someone@sender.test>')).toBe('250 OK');
    expect(await client.send('RCPT TO:<victim@elsewhere.test>')).toStartWith('530');
    expect(await client.send('RCPT TO:<anyone@unverified.test>')).toStartWith('530');
    // Nothing was accepted, so there is no message to take.
    expect(await client.send('DATA')).toStartWith('503');
    client.close();

    expect(await messageCount()).toBe(before);
  });

  it('answers pipelined commands in the order they were sent', async () => {
    // Replies that wait on the database used to be sent whenever the query
    // finished, so DATA's 354 could overtake the RCPT replies before it.
    const id = newMessageId();
    const client = await Client.connect(smtp.port);
    await client.authenticate();
    client.write([
      'MAIL FROM:<app@posta.test>',
      'RCPT TO:<one@remote.test>',
      'RCPT TO:<two@remote.test>',
      'DATA',
      '',
    ].join('\r\n'));
    expect(await client.reply()).toBe('250 OK');
    expect(await client.reply()).toBe('250 OK');
    expect(await client.reply()).toBe('250 OK');
    expect(await client.reply()).toStartWith('354');
    client.write(message(id));
    expect(await client.reply()).toBe('250 OK');
    client.close();

    expect(await stored(id)).toHaveLength(2);
  });

  it('stores an 8-bit body byte for byte', async () => {
    const id = newMessageId();
    const client = await Client.connect(smtp.port);
    await client.authenticate();
    expect(await client.send('MAIL FROM:<app@posta.test>')).toBe('250 OK');
    expect(await client.send('RCPT TO:<one@remote.test>')).toBe('250 OK');
    expect(await client.send('DATA')).toStartWith('354');
    client.write(Buffer.from(message(id, 'Grüße — ✓'), 'utf-8'));
    expect(await client.reply()).toBe('250 OK');
    client.close();

    const [row] = await stored(id);
    const body = await new MessageStore(msgDb).getRawBody(row);
    expect(Buffer.from(body, 'latin1').toString('utf-8')).toContain('Grüße — ✓');
  });

  it('defers the message when it cannot be stored', async () => {
    // The client keeps a message until it gets a 250, so a failure here must
    // not be answered with one.
    smtp.onMessage = async () => { throw new Error('database unavailable'); };
    try {
      const client = await Client.connect(smtp.port);
      await client.authenticate();
      expect(await client.send('MAIL FROM:<app@posta.test>')).toBe('250 OK');
      expect(await client.send('RCPT TO:<one@remote.test>')).toBe('250 OK');
      expect(await client.send('DATA')).toStartWith('354');
      client.write(message(newMessageId()));
      expect(await client.reply()).toStartWith('451');
      client.close();
    } finally {
      smtp.onMessage = (msg) => queuer.queue(msg);
    }
  });
});

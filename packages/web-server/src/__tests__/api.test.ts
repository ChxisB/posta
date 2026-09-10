import { describe, it, expect, beforeAll } from 'bun:test';
import { app } from '../index';

const TEST_RUN_ID = Date.now();
let testApiKey: string;
let testServerId: number;

function unwrap(body: any): any {
  return body?.data ?? body;
}

describe('REST API — POST /api/v1/send', () => {
  beforeAll(async () => {
    process.env.POSTA_MAIN_DB_URL = `postgresql://postgres:postgres@localhost:5432/posta_test_api_${TEST_RUN_ID}`;
    process.env.POSTA_MESSAGE_DB_URL = `postgresql://postgres:postgres@localhost:5432/posta_test_api_${TEST_RUN_ID}`;
    process.env.POSTA_CONFIG_FILE_PATH = '/dev/null';

    // Seed a server + API credential
    const { getDb } = await import('../index');
    const db = await getDb();
    testApiKey = 'test-api-key-' + TEST_RUN_ID;
    await db.run(`INSERT INTO organizations (id, uuid, name, permalink) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`, [1, 'org-uuid', 'Test Org', 'test-org']);
    await db.run(`INSERT INTO servers (id, organization_id, uuid, name, permalink) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`, [1, 1, 'srv-uuid', 'Test Server', 'test-server']);
    await db.run(`INSERT INTO credentials (id, server_id, key, type, name) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`, [1, 1, testApiKey, 'API', 'Test API Key']);
    testServerId = 1;
  });

  it('sends a structured email', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Server-API-Key': testApiKey },
        body: JSON.stringify({
          to: ['recipient@example.com'],
          from: 'sender@example.com',
          subject: 'Test',
          plain_body: 'Hello world',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('success');
    const data = unwrap(body);
    expect(data.message_id).toBeDefined();
    expect(data.messages).toBeDefined();
    expect(data.messages['recipient@example.com']).toBeDefined();
    expect(data.messages['recipient@example.com'].id).toBeGreaterThan(0);
  });

  it('returns error when from is missing', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Server-API-Key': testApiKey },
        body: JSON.stringify({
          to: ['recipient@example.com'],
          plain_body: 'Hello',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('error');
    expect(body.data.code).toBe('FromAddressMissing');
  });

  it('returns error when no recipients', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Server-API-Key': testApiKey },
        body: JSON.stringify({
          from: 'sender@example.com',
          subject: 'Test',
          plain_body: 'Hello',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('error');
    expect(body.data.code).toBe('NoRecipients');
  });

  it('returns error when no content', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Server-API-Key': testApiKey },
        body: JSON.stringify({
          to: ['recipient@example.com'],
          from: 'sender@example.com',
          subject: 'Test',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('error');
    expect(body.data.code).toBe('NoContent');
  });

  it('returns AccessDenied without a valid API key', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: ['recipient@example.com'],
          from: 'sender@example.com',
          subject: 'Test',
          plain_body: 'Hello',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('error');
    expect(body.data.code).toBe('AccessDenied');
  });

  it('returns InvalidServerAPIKey with a bad API key', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Server-API-Key': 'wrong-key' },
        body: JSON.stringify({
          to: ['recipient@example.com'],
          from: 'sender@example.com',
          subject: 'Test',
          plain_body: 'Hello',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('error');
    expect(body.data.code).toBe('InvalidServerAPIKey');
  });
});

describe('REST API — POST /api/v1/send/raw', () => {
  it('sends a raw email', async () => {
    const rawMessage = Buffer.from('From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nHello').toString('base64');
    const res = await app.handle(
      new Request('http://localhost/api/v1/send/raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Server-API-Key': testApiKey },
        body: JSON.stringify({
          rcpt_to: ['recipient@example.com'],
          mail_from: 'sender@example.com',
          data: rawMessage,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('success');
    expect(unwrap(body).messages).toBeDefined();
  });
});

describe('REST API — GET /api/v1/messages/:id', () => {
  let testMessageId: number;

  beforeAll(async () => {
    // Create a message to query
    const res = await app.handle(
      new Request('http://localhost/api/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Server-API-Key': testApiKey },
        body: JSON.stringify({
          to: ['getmsg@example.com'],
          from: 'sender@example.com',
          subject: 'Test Message Query',
          plain_body: 'Hello from test',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    testMessageId = unwrap(body).messages['getmsg@example.com'].id;
  });

  it('returns message details with expand=status,details', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/v1/messages/${testMessageId}?expand=status,details`, {
        method: 'GET',
        headers: { 'X-Server-API-Key': testApiKey },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('success');
    const data = unwrap(body);
    expect(data.message).toBeDefined();
    expect(data.message.id).toBe(testMessageId);
    expect(data.message.token).toBeDefined();
    expect(data.message.token).not.toBe('placeholder-token');
    expect(data.message.status).toBeDefined();
    expect(data.message.status.status).toBe('Pending');
    expect(data.message.details).toBeDefined();
    expect(data.message.details.rcpt_to).toBe('getmsg@example.com');
    expect(data.message.details.mail_from).toBe('sender@example.com');
    expect(data.message.details.subject).toBe('Test Message Query');
    expect(data.message.details.direction).toBe('outgoing');
  });

  it('returns message with headers when expand=headers', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/v1/messages/${testMessageId}?expand=headers`, {
        method: 'GET',
        headers: { 'X-Server-API-Key': testApiKey },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('success');
    const data = unwrap(body);
    expect(data.message).toBeDefined();
    expect(data.message.headers).toBeDefined();
    const headerKeys = Object.keys(data.message.headers);
    expect(headerKeys).toContain('from');
    expect(headerKeys).toContain('to');
    expect(headerKeys).toContain('subject');
  });

  it('returns ServerRequired when not authenticated', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/v1/messages/1?expand=status`, {
        method: 'GET',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('error');
    expect(body.data.code).toBe('AccessDenied');
  });

  it('returns error for non-numeric id', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/v1/messages/abc`, {
        method: 'GET',
        headers: { 'X-Server-API-Key': testApiKey },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('error');
    expect(body.data.code).toBe('InvalidParameter');
  });

  it('returns error for non-existent message', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/v1/messages/99999`, {
        method: 'GET',
        headers: { 'X-Server-API-Key': testApiKey },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('error');
    expect(body.data.code).toBe('MessageNotFound');
  });
});

describe('REST API — GET /api/v1/messages/:id/deliveries', () => {
  let testMessageId: number;

  beforeAll(async () => {
    const res = await app.handle(
      new Request('http://localhost/api/v1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Server-API-Key': testApiKey },
        body: JSON.stringify({
          to: ['deliveries-test@example.com'],
          from: 'sender@example.com',
          subject: 'Deliveries Test',
          plain_body: 'Testing deliveries endpoint',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    testMessageId = unwrap(body).messages['deliveries-test@example.com'].id;
  });

  it('returns delivery attempts array', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/v1/messages/${testMessageId}/deliveries`, {
        method: 'GET',
        headers: { 'X-Server-API-Key': testApiKey },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('success');
    expect(unwrap(body).deliveries).toBeArray();
  });

  it('returns error for non-existent message deliveries', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/v1/messages/99999/deliveries`, {
        method: 'GET',
        headers: { 'X-Server-API-Key': testApiKey },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('error');
    expect(body.data.code).toBe('MessageNotFound');
  });
});

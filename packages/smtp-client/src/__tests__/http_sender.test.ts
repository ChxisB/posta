import { describe, it, expect, mock, afterEach } from 'bun:test';
import { HttpSender } from '../http_sender';
import { separateReplies } from '../http_sender';
import type { HttpMessage } from '../http_sender';
import type { HttpDeliveryResult } from '../http_sender';
import type { HttpEndpoint } from '@posta/core';

// ─── Helpers ───────────────────────────────────────────────────────────

function makeEndpoint(overrides: Partial<HttpEndpoint> = {}): HttpEndpoint {
  return {
    url: 'https://example.com/webhook',
    encoding: undefined,
    format: 'Hash',
    strip_replies: false,
    include_attachments: false,
    timeout: 5,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<HttpMessage> = {}): HttpMessage {
  return {
    id: 1001,
    rcpt_to: 'recipient@example.com',
    mail_from: 'sender@example.com',
    token: 'abc123token',
    subject: 'Test Subject',
    message_id: '<msg-001@example.com>',
    timestamp: 1752940800,
    size: '1024',
    spam_status: undefined,
    bounce: false,
    received_with_ssl: true,
    headers: {
      to: ['Recipient <recipient@example.com>'],
      from: ['Sender <sender@example.com>'],
      date: ['Sat, 19 Jul 2026 12:00:00 +0000'],
      subject: ['Test Subject'],
      'reply-to': ['noreply@example.com'],
    },
    plain_body: 'Hello world',
    html_body: '<p>Hello world</p>',
    raw_message: 'From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nHello world',
    ...overrides,
  };
}

function mockFetch(status: number, body: string = 'OK'): void {
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(body, { status })),
  );
}

function mockFetchError(error: Error): void {
  globalThis.fetch = mock(() => Promise.reject(error));
}

// Restore fetch after each test
afterEach(() => {
  mock.restore();
});

// ─── HttpSender: construction ──────────────────────────────────────────

describe('HttpSender construction', () => {
  it('creates an HttpSender with a mock endpoint', () => {
    const endpoint = makeEndpoint();
    const sender = new HttpSender(endpoint);

    expect(sender).toBeDefined();
    expect(sender).toBeInstanceOf(HttpSender);
  });

  it('accepts an optional signing key', () => {
    const endpoint = makeEndpoint();
    const sender = new HttpSender(endpoint, { signingKey: 'secret123' });

    expect(sender).toBeDefined();
  });

  it('sends a message and returns a result (2xx)', async () => {
    const endpoint = makeEndpoint();
    const sender = new HttpSender(endpoint);
    const message = makeMessage();

    mockFetch(200, '{"status":"ok"}');

    const result = await sender.sendMessage(message);

    expect(result.success).toBeTrue();
    expect(result.classification).toBe('Sent');
    expect(result.statusCode).toBe(200);
    expect(result.retry).toBeFalse();
    expect(result.suppressBounce).toBeFalse();
    expect(result.connectError).toBeFalse();
  });
});

// ─── Parameter building: Hash format ───────────────────────────────────

describe('Parameter building — Hash format', () => {
  it('sends expected message fields in the request body', async () => {
    const endpoint = makeEndpoint({ format: 'Hash' });
    const sender = new HttpSender(endpoint);
    const message = makeMessage({ id: 9999, subject: 'Hash Test' });

    let capturedBody = '';
    globalThis.fetch = mock(async (input: string, init: RequestInit) => {
      capturedBody = (init?.body as string) ?? '';
      return new Response('OK', { status: 200 });
    });

    await sender.sendMessage(message);

    const parsed = JSON.parse(capturedBody);
    expect(parsed.id).toBe(9999);
    expect(parsed.rcpt_to).toBe('recipient@example.com');
    expect(parsed.mail_from).toBe('sender@example.com');
    expect(parsed.token).toBe('abc123token');
    expect(parsed.subject).toBe('Hash Test');
    expect(parsed.message_id).toBe('<msg-001@example.com>');
    expect(parsed.timestamp).toBe(1752940800);
    expect(parsed.size).toBe('1024');
    expect(parsed.bounce).toBeFalse();
    expect(parsed.received_with_ssl).toBeTrue();
    expect(parsed.html_body).toBe('<p>Hello world</p>');
    expect(parsed.plain_body).toBe('Hello world');
    expect(parsed.to).toBe('Recipient <recipient@example.com>');
    expect(parsed.from).toBe('Sender <sender@example.com>');
    expect(parsed.date).toBe('Sat, 19 Jul 2026 12:00:00 +0000');
    expect(parsed.reply_to).toEqual(['noreply@example.com']);
    expect(parsed.attachment_quantity).toBe(0);
  });
});

// ─── Parameter building: RawMessage format ─────────────────────────────

describe('Parameter building — RawMessage format', () => {
  it('sends base64-encoded raw message with metadata', async () => {
    const endpoint = makeEndpoint({ format: 'RawMessage' });
    const sender = new HttpSender(endpoint);
    const message = makeMessage({
      id: 42,
      rcpt_to: 'r@e.com',
      mail_from: 's@e.com',
      raw_message: 'test raw body',
      size: '15',
    });

    let capturedBody = '';
    globalThis.fetch = mock(async (input: string, init: RequestInit) => {
      capturedBody = (init?.body as string) ?? '';
      return new Response('OK', { status: 200 });
    });

    await sender.sendMessage(message);

    const parsed = JSON.parse(capturedBody);
    expect(parsed.id).toBe(42);
    expect(parsed.rcpt_to).toBe('r@e.com');
    expect(parsed.mail_from).toBe('s@e.com');
    expect(parsed.base64).toBeTrue();
    expect(parsed.size).toBe(15);

    // Verify message is base64-encoded
    const decoded = Buffer.from(parsed.message, 'base64').toString('utf-8');
    expect(decoded).toBe('test raw body');
  });

  it('defaults size to 0 when not parseable', async () => {
    const endpoint = makeEndpoint({ format: 'RawMessage' });
    const sender = new HttpSender(endpoint);
    const message = makeMessage({ raw_message: 'x', size: 'not-a-number' });

    let capturedBody = '';
    globalThis.fetch = mock(async (input: string, init: RequestInit) => {
      capturedBody = (init?.body as string) ?? '';
      return new Response('OK', { status: 200 });
    });

    await sender.sendMessage(message);

    const parsed = JSON.parse(capturedBody);
    expect(parsed.size).toBe(0);
  });
});

// ─── Response classification ───────────────────────────────────────────

describe('Response classification', () => {
  it('classifies 2xx as Sent', async () => {
    const sender = new HttpSender(makeEndpoint());
    mockFetch(200);

    const result = await sender.sendMessage(makeMessage());

    expect(result.classification).toBe('Sent');
    expect(result.success).toBeTrue();
    expect(result.retry).toBeFalse();
  });

  it('classifies 201 as Sent', async () => {
    const sender = new HttpSender(makeEndpoint());
    mockFetch(201, 'Created');

    const result = await sender.sendMessage(makeMessage());

    expect(result.classification).toBe('Sent');
    expect(result.success).toBeTrue();
  });

  it('classifies 299 as Sent', async () => {
    const sender = new HttpSender(makeEndpoint());
    mockFetch(299);

    const result = await sender.sendMessage(makeMessage());

    expect(result.classification).toBe('Sent');
  });

  it('classifies 5xx as SoftFail with retry=true', async () => {
    const sender = new HttpSender(makeEndpoint());
    mockFetch(500, 'Internal Server Error');

    const result = await sender.sendMessage(makeMessage());

    expect(result.classification).toBe('SoftFail');
    expect(result.success).toBeFalse();
    expect(result.retry).toBeTrue();
    expect(result.connectError).toBeFalse();
    expect(result.statusCode).toBe(500);
  });

  it('classifies 503 as SoftFail', async () => {
    const sender = new HttpSender(makeEndpoint());
    mockFetch(503, 'Service Unavailable');

    const result = await sender.sendMessage(makeMessage());

    expect(result.classification).toBe('SoftFail');
    expect(result.retry).toBeTrue();
  });

  it('classifies 429 as HardFail with suppressBounce=true', async () => {
    const sender = new HttpSender(makeEndpoint());
    mockFetch(429, 'Rate limit exceeded');

    const result = await sender.sendMessage(makeMessage());

    expect(result.classification).toBe('HardFail');
    expect(result.success).toBeFalse();
    expect(result.retry).toBeFalse();
    expect(result.suppressBounce).toBeTrue();
    expect(result.statusCode).toBe(429);
  });

  it('classifies other 4xx as HardFail', async () => {
    const sender = new HttpSender(makeEndpoint());
    mockFetch(404, 'Not Found');

    const result = await sender.sendMessage(makeMessage());

    expect(result.classification).toBe('HardFail');
    expect(result.success).toBeFalse();
    expect(result.retry).toBeFalse();
    expect(result.suppressBounce).toBeFalse();
  });
});

// ─── Connection errors ─────────────────────────────────────────────────

describe('Connection errors', () => {
  it('classifies connection error as SoftFail with connectError=true', async () => {
    const sender = new HttpSender(makeEndpoint());
    mockFetchError(new TypeError('fetch failed'));

    const result = await sender.sendMessage(makeMessage());

    expect(result.classification).toBe('SoftFail');
    expect(result.success).toBeFalse();
    expect(result.retry).toBeTrue();
    expect(result.connectError).toBeTrue();
    expect(result.statusCode).toBeLessThan(0);
  });

  it('classifies abort/timeout as SoftFail with statusCode -1', async () => {
    const sender = new HttpSender(makeEndpoint({ timeout: 1 }));
    mockFetchError(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));

    const result = await sender.sendMessage(makeMessage());

    expect(result.classification).toBe('SoftFail');
    expect(result.statusCode).toBe(-1);
    expect(result.connectError).toBeTrue();
  });

  it('classifies SSL errors with statusCode -3', async () => {
    const sender = new HttpSender(makeEndpoint());
    mockFetchError(new Error('SSL certificate verification failed'));

    const result = await sender.sendMessage(makeMessage());

    expect(result.statusCode).toBe(-3);
    expect(result.connectError).toBeTrue();
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('returns HardFail when endpoint has no URL', async () => {
    const endpoint = makeEndpoint({ url: null });
    const sender = new HttpSender(endpoint);

    const result = await sender.sendMessage(makeMessage());

    expect(result.classification).toBe('HardFail');
    expect(result.success).toBeFalse();
    expect(result.statusCode).toBe(0);
  });

  it('caps output to 500 characters', async () => {
    const sender = new HttpSender(makeEndpoint());
    const longBody = 'x'.repeat(1000);
    mockFetch(200, longBody);

    const result = await sender.sendMessage(makeMessage());

    expect(result.output).toBeDefined();
    expect(result.output!.length).toBeLessThanOrEqual(500);
  });

  it('includes secure=true for HTTPS endpoints', async () => {
    const sender = new HttpSender(makeEndpoint({ url: 'https://secure.example.com' }));
    mockFetch(200);

    const result = await sender.sendMessage(makeMessage());

    expect(result.secure).toBeTrue();
  });

  it('includes secure=false for HTTP endpoints', async () => {
    const sender = new HttpSender(makeEndpoint({ url: 'http://insecure.example.com' }));
    mockFetch(200);

    const result = await sender.sendMessage(makeMessage());

    expect(result.secure).toBeFalse();
  });
});

// ─── Reply separator ───────────────────────────────────────────────────

describe('separateReplies', () => {
  it('strips "On ... wrote:" prefix', () => {
    const text = 'Hello\n\nOn Monday, John wrote:\n> I agree\n> yes';
    const [cleaned, stripped] = separateReplies(text);
    // The "On ... wrote:" line is stripped, but < 10 quoted lines remain
    expect(cleaned).toBe('Hello\n\n> I agree\n> yes');
    expect(stripped).toContain('On Monday, John wrote:');
  });

  it('strips "-----Original Message-----" blocks', () => {
    const text = 'My reply\n\n-----Original Message-----\nFrom: someone\nSent: yesterday';
    const [cleaned, stripped] = separateReplies(text);
    expect(cleaned).toBe('My reply');
    expect(stripped).toContain('-----Original Message-----');
  });

  it('strips "=== Please reply above this line ===" blocks', () => {
    const text = '=== Please reply above this line ===\nMy answer\n=== Please reply above this line ===\nOld stuff';
    const [cleaned, stripped] = separateReplies(text);
    // Both "=== ... ===" lines are stripped; "Old stuff" remains (not matched by any rule)
    expect(cleaned).toBe('My answer\n\nOld stuff');
    expect(stripped).toContain('=== Please reply above this line ===');
  });

  it('returns null for stripped when there is nothing to strip', () => {
    const text = 'Just a simple message';
    const [cleaned, stripped] = separateReplies(text);
    expect(cleaned).toBe('Just a simple message');
    expect(stripped).toBeNull();
  });

  it('handles empty strings', () => {
    const [cleaned, stripped] = separateReplies('');
    expect(cleaned).toBe('');
    expect(stripped).toBeNull();
  });
});

// ─── Strip replies in Hash format ─────────────────────────────────────

describe('strip_replies in Hash format', () => {
  it('strips replies from plain_body when strip_replies is true', async () => {
    const endpoint = makeEndpoint({ format: 'Hash', strip_replies: true });
    const sender = new HttpSender(endpoint);
    const message = makeMessage({
      plain_body: 'My answer\n\nOn Monday, John wrote:\n> Original message',
    });

    let capturedBody = '';
    globalThis.fetch = mock(async (input: string, init: RequestInit) => {
      capturedBody = (init?.body as string) ?? '';
      return new Response('OK', { status: 200 });
    });

    await sender.sendMessage(message);

    const parsed = JSON.parse(capturedBody);
    // "On ... wrote:" line stripped; single quoted line (< 10) remains
    expect(parsed.plain_body).toBe('My answer\n\n> Original message');
    expect(parsed.replies_from_plain_body).toContain('On Monday, John wrote:');
  });

  it('does not strip replies when strip_replies is false', async () => {
    const endpoint = makeEndpoint({ format: 'Hash', strip_replies: false });
    const sender = new HttpSender(endpoint);
    const originalBody = 'My answer\n\nOn Monday, John wrote:\n> Original message';
    const message = makeMessage({ plain_body: originalBody });

    let capturedBody = '';
    globalThis.fetch = mock(async (input: string, init: RequestInit) => {
      capturedBody = (init?.body as string) ?? '';
      return new Response('OK', { status: 200 });
    });

    await sender.sendMessage(message);

    const parsed = JSON.parse(capturedBody);
    expect(parsed.plain_body).toBe(originalBody);
    expect(parsed.replies_from_plain_body).toBeUndefined();
  });
});

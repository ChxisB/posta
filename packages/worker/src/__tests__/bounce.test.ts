import { describe, it, expect, beforeAll } from 'bun:test';
import { BounceProcessor } from '../bounce';
import type { BounceOptions } from '../bounce';
import type { PostaConfig } from '@posta/core';
import { initializeMainDb, getServerDb } from '@posta/core';
import { MessageDbProvisioner, MessageStore } from '@posta/message-db';

const TEST_DB_URL = process.env.POSTA_MAIN_DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/posta_test';

/**
 * Minimal config fixture with only the fields needed for bounce processing.
 */
function buildConfig(returnPathDomain: string = 'return.example.com'): PostaConfig {
  return {
    posta: {
      web_hostname: 'mail.example.com',
      web_protocol: 'https',
      smtp_hostname: 'smtp.example.com',
      use_ip_pools: false,
      default_maximum_delivery_attempts: 18,
      default_maximum_hold_expiry_days: 7,
      default_suppression_list_automatic_removal_days: 30,
      default_spam_threshold: 5,
      default_spam_failure_threshold: 20,
      use_local_ns_for_domain_verification: false,
      use_resent_sender_header: false,
      signing_key_path: '/tmp/signing.key',
      queued_message_lock_stale_days: 2,
      batch_queued_messages: false,
    },
    web_server: {
      default_port: 5000,
      default_bind_address: '127.0.0.1',
      max_threads: 10,
    },
    worker: {
      default_health_server_port: 9090,
      default_health_server_bind_address: '127.0.0.1',
      threads: 2,
    },
    main_db: {
      url: TEST_DB_URL,
    },
    message_db: {
      url: TEST_DB_URL,
      schema_prefix: 'posta-bounce-test',
    },
    logging: {
      enabled: false,
      level: 'info',
    },
    smtp_server: {
      default_port: 2525,
      default_bind_address: '127.0.0.1',
      default_health_server_port: 9091,
      default_health_server_bind_address: '127.0.0.1',
      tls_enabled: false,
      tls_certificate_path: '',
      tls_private_key_path: '',
      ssl_version: 'TLSv1_2',
      proxy_protocol: false,
      log_connections: false,
      max_message_size: 52428800,
    },
    dns: {
      mx_records: [],
      spf_include: '',
      return_path_domain: returnPathDomain,
      route_domain: 'routes.example.com',
      track_domain: 'track.example.com',
      dkim_identifier: 'posta',
      domain_verify_prefix: 'posta-verify',
      custom_return_path_prefix: 'psrp',
      timeout: 5,
    },
    smtp: {
      host: '127.0.0.1',
      port: 2525,
      authentication_type: 'login',
      enable_starttls: false,
      enable_starttls_auto: false,
      openssl_verify_mode: 'none',
      from_name: 'Posta',
      from_address: 'noreply@example.com',
    },
    smtp_client: {
      open_timeout: 30,
      read_timeout: 30,
    },
  };
}

function buildOptions(overrides: Partial<BounceOptions> = {}): BounceOptions {
  return {
    serverId: 1,
    messageId: 42,
    mailFrom: 'sender@example.com',
    rcptTo: 'recipient@badhost.invalid',
    subject: 'Hello World',
    token: 'abc123token',
    messageId_header: '<msg-42@original.example.com>',
    routeDescription: 'badhost.invalid (MX)',
    domainName: 'example.com',
    rawMessage:
      'From: sender@example.com\r\n' +
      'To: recipient@badhost.invalid\r\n' +
      'Subject: Hello World\r\n' +
      'Message-ID: <msg-42@original.example.com>\r\n' +
      'Date: Mon, 19 Jul 2026 10:00:00 +0000\r\n' +
      '\r\n' +
      'This is the original message body.',
    ...overrides,
  };
}

// ─── buildBounceMessage ────────────────────────────────────────

describe('BounceProcessor.buildBounceMessage', () => {
  const config = buildConfig();
  const provisioner = new MessageDbProvisioner(config);
  const processor = new BounceProcessor(config, provisioner);

  const opts = buildOptions();

  it('builds a MIME message containing the original message as an attachment', () => {
    const result = processor.buildBounceMessage(opts, config.dns.return_path_domain);

    // Should be a multipart MIME message
    expect(result).toContain('MIME-Version: 1.0');
    expect(result).toContain('Content-Type: multipart/mixed');

    // Should contain the original message as an attachment
    expect(result).toContain('Content-Type: message/rfc822');
    expect(result).toContain('filename="Original Message.eml"');

    // Should contain the original body
    expect(result).toContain('This is the original message body.');
  });

  it('sets the To address to the original sender', () => {
    const result = processor.buildBounceMessage(opts, config.dns.return_path_domain);
    expect(result).toContain(`To: ${opts.mailFrom}`);
  });

  it('sets the From address using the route description', () => {
    const result = processor.buildBounceMessage(opts, config.dns.return_path_domain);
    expect(result).toContain(`From: Mail Delivery Service <${opts.routeDescription}>`);
  });

  it('sets the Subject to indicate delivery failure with the original subject', () => {
    const result = processor.buildBounceMessage(opts, config.dns.return_path_domain);
    expect(result).toContain(`Subject: Mail Delivery Failed (${opts.subject})`);
  });

  it('generates a unique Message-ID with the return path domain', () => {
    const result = processor.buildBounceMessage(opts, config.dns.return_path_domain);

    // Message-ID format: <uuid@return.example.com>
    const msgIdMatch = result.match(/^Message-ID:\s*(<[^>]+@return\.example\.com>)/m);
    expect(msgIdMatch).not.toBeNull();
    expect(msgIdMatch![1]).toMatch(/^<[0-9a-f-]+@return\.example\.com>$/);
  });

  it('includes the message token in the body', () => {
    const result = processor.buildBounceMessage(opts, config.dns.return_path_domain);
    expect(result).toContain(`Message Token: ${opts.token}`);
  });

  it('includes the original Message-ID in the body', () => {
    const result = processor.buildBounceMessage(opts, config.dns.return_path_domain);
    expect(result).toContain(`Original Message ID: ${opts.messageId_header}`);
  });

  it('includes the mail_from (envelope sender) in the body', () => {
    const result = processor.buildBounceMessage(opts, config.dns.return_path_domain);
    expect(result).toContain(`Mail from: ${opts.mailFrom}`);
  });

  it('includes the rcpt_to (failed recipient) in the body', () => {
    const result = processor.buildBounceMessage(opts, config.dns.return_path_domain);
    expect(result).toContain(`Rcpt To: ${opts.rcptTo}`);
  });

  it('includes the route description in the body', () => {
    const result = processor.buildBounceMessage(opts, config.dns.return_path_domain);
    expect(result).toContain(
      `delivering mail to ${opts.routeDescription}`,
    );
  });

  it('includes postmaster contact when domainName is provided', () => {
    const result = processor.buildBounceMessage(opts, config.dns.return_path_domain);
    expect(result).toContain('postmaster@example.com');
  });

  it('falls back to generic contact when domainName is omitted', () => {
    const noDomain = buildOptions({ domainName: undefined });
    const result = processor.buildBounceMessage(noDomain, config.dns.return_path_domain);
    expect(result).toContain('the relevant mail administrator');
    expect(result).not.toContain('postmaster@');
  });

  it('attaches the original message with quoted-printable encoding', () => {
    const result = processor.buildBounceMessage(opts, config.dns.return_path_domain);

    // The attachment part should have Content-Transfer-Encoding: quoted-printable
    expect(result).toContain('Content-Transfer-Encoding: quoted-printable');

    // The original subject should be present in the quoted-printable attachment
    // (Subject is plain ASCII so it passes through unchanged)
    expect(result).toContain('Subject: Hello World');
  });

  it('produces a valid MIME multipart structure with boundaries', () => {
    const result = processor.buildBounceMessage(opts, config.dns.return_path_domain);

    // Extract the boundary
    const boundaryMatch = result.match(/boundary="([^"]+)"/);
    expect(boundaryMatch).not.toBeNull();

    const boundary = boundaryMatch![1];
    // Should appear at least 3 times: once after headers, once between parts, once to close
    const occurrences = result.split(boundary).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(3);

    // Should end with boundary--
    expect(result).toContain(`--${boundary}--`);
  });

  it('generates different Message-IDs for different calls', () => {
    const result1 = processor.buildBounceMessage(opts, config.dns.return_path_domain);
    const result2 = processor.buildBounceMessage(opts, config.dns.return_path_domain);

    const id1 = result1.match(/^Message-ID:\s*(<[^>]+>)/m)?.[1];
    const id2 = result2.match(/^Message-ID:\s*(<[^>]+>)/m)?.[1];

    expect(id1).not.toBeNull();
    expect(id2).not.toBeNull();
    expect(id1).not.toBe(id2);
  });
});

// ─── quoted-printable encoding ─────────────────────────────────

describe('Quoted-printable attachment encoding', () => {
  const config = buildConfig();
  const provisioner = new MessageDbProvisioner(config);
  const processor = new BounceProcessor(config, provisioner);

  it('encodes non-ASCII characters in the attachment', () => {
    const opts = buildOptions({
      rawMessage:
        'Subject: Test = avec \u00e9gal\r\n' +
        'From: sender@example.com\r\n' +
        '\r\n' +
        'Body with \u00e9 and \u20ac.',
    });

    const result = processor.buildBounceMessage(opts, config.dns.return_path_domain);

    // The '=' sign (0x3D) should be encoded as =3D
    expect(result).toContain('=3D');

    // Non-ASCII bytes should be encoded as =XX
    // é (U+00E9) in UTF-8 is 0xC3 0xA9 -> =C3=A9
    expect(result).toMatch(/=C3=A9/);
  });

  it('handles the equals sign in original message body', () => {
    const opts = buildOptions({
      rawMessage:
        'Content-Type: text/plain\r\n' +
        '\r\n' +
        'x = y + z',
    });

    const result = processor.buildBounceMessage(opts, config.dns.return_path_domain);

    // The equals sign in "x = y + z" should be encoded as =3D
    expect(result).toContain('x =3D y + z');
  });
});

// ─── processBounce ─────────────────────────────────────────────

describe('BounceProcessor.processBounce', () => {
  let config: PostaConfig;
  let provisioner: MessageDbProvisioner;
  let processor: BounceProcessor;

  beforeAll(async () => {
    config = buildConfig();
    // Initialize the main DB so queued_messages table exists
    await initializeMainDb(config);
    provisioner = new MessageDbProvisioner(config);
    processor = new BounceProcessor(config, provisioner);
  });

  it('returns a numeric message ID', async () => {
    const opts = buildOptions();
    const msgId = await processor.processBounce(opts);

    expect(msgId).toBeGreaterThan(0);
    expect(typeof msgId).toBe('number');
  });

  it('stores the message in the server MessageDB with bounce flags', async () => {
    const opts = buildOptions();
    const msgId = await processor.processBounce(opts);

    // Open the server DB and read back the message
    const client = getServerDb(config, opts.serverId);
    const msgDb = await provisioner.openServerDb(opts.serverId, client);
    const msgStore = new MessageStore(msgDb);

    const record = await msgStore.findOne({ id: msgId });

    expect(record.scope).toBe('outgoing');
    expect(record.bounce).toBeTruthy();
    expect(record.bounce_for_id).toBe(opts.messageId);
    expect(record.rcpt_to).toBe(opts.mailFrom);
  });

  it('creates a distinct message from the original', async () => {
    const opts = buildOptions({ messageId: 999 });
    const msgId = await processor.processBounce(opts);

    // The bounce message ID should be different from the original
    expect(msgId).not.toBe(opts.messageId);
  });
});

import { describe, it, expect, beforeAll, afterEach } from 'bun:test';
import type { PostaConfig } from '@posta/core';
import { initializeMainDb, getMainDb } from '@posta/core';
import { MessageDbProvisioner, MessageStore } from '@posta/message-db';
import {
  sendServerSendLimitApproachingEmail,
  sendServerSendLimitExceededEmail,
  sendServerSuspendedEmail,
  sendTestEmail,
} from '../mailers';

/**
 * Minimal config fixture for mailer tests.
 */
function buildConfig(): PostaConfig {
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
      path: ':memory:',
    },
    message_db: {
      directory: '/tmp/test-mailer-dbs',
      database_name_prefix: 'posta-mailer-test',
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
      return_path_domain: 'return.example.com',
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

// ─── Tests ─────────────────────────────────────────────────────

describe('Notification Mailers', () => {
  let config: PostaConfig;
  let provisioner: MessageDbProvisioner;
  const serverId = 42;

  beforeAll(() => {
    config = buildConfig();
    initializeMainDb(config);
    provisioner = new MessageDbProvisioner(config);

    // Insert a test server record with a postmaster_address
    const mainDb = getMainDb(config);
    mainDb.run(
      `INSERT OR IGNORE INTO servers (id, uuid, name, mode, permalink, send_limit, postmaster_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [serverId, 'test-uuid', 'TestServer', 'Live', 'test-server', 1000, 'admin@example.com'],
    );
  });

  afterEach(() => {
    // Clean up queued messages between tests
    const mainDb = getMainDb(config);
    mainDb.run(`DELETE FROM queued_messages`);
  });

  // ─── sendServerSendLimitApproachingEmail ─────────────────────

  describe('sendServerSendLimitApproachingEmail', () => {
    it('returns a numeric message ID', () => {
      const msgId = sendServerSendLimitApproachingEmail(
        config,
        serverId,
        'TestServer',
        1000,
        900,
      );

      expect(msgId).toBeGreaterThan(0);
      expect(typeof msgId).toBe('number');
    });

    it('stores the message in the server MessageDB', () => {
      const msgId = sendServerSendLimitApproachingEmail(
        config,
        serverId,
        'TestServer',
        1000,
        900,
      );

      const msgDb = provisioner.openServerDb(serverId);
      const msgStore = new MessageStore(msgDb);
      const record = msgStore.findOne({ id: msgId });

      expect(record.scope).toBe('outgoing');
      expect(record.status).toBe('Pending');
      expect(record.rcpt_to).toBe('admin@example.com');
      expect(record.subject).toContain('approaching its send limit');
    });

    it('creates a queued message in the main DB', () => {
      const msgId = sendServerSendLimitApproachingEmail(
        config,
        serverId,
        'TestServer',
        1000,
        900,
      );

      const mainDb = getMainDb(config);
      const queued = mainDb.query(
        `SELECT * FROM queued_messages WHERE server_id = ? AND message_id = ?`,
      ).all(serverId, msgId) as any[];

      expect(queued).toHaveLength(1);
    });

    it('includes usage details in the raw message body', () => {
      const msgId = sendServerSendLimitApproachingEmail(
        config,
        serverId,
        'TestServer',
        1000,
        900,
      );

      const msgDb = provisioner.openServerDb(serverId);
      const msgStore = new MessageStore(msgDb);
      const record = msgStore.findOne({ id: msgId });
      const rawBody = msgStore.getRawBody(record);

      expect(rawBody).toContain('900');
      expect(rawBody).toContain('1000');
      expect(rawBody).toContain('TestServer');
    });
  });

  // ─── sendServerSendLimitExceededEmail ────────────────────────

  describe('sendServerSendLimitExceededEmail', () => {
    it('returns a numeric message ID', () => {
      const msgId = sendServerSendLimitExceededEmail(
        config,
        serverId,
        'TestServer',
        1000,
        1050,
      );

      expect(msgId).toBeGreaterThan(0);
    });

    it('stores the message with exceeded subject', () => {
      const msgId = sendServerSendLimitExceededEmail(
        config,
        serverId,
        'TestServer',
        1000,
        1050,
      );

      const msgDb = provisioner.openServerDb(serverId);
      const msgStore = new MessageStore(msgDb);
      const record = msgStore.findOne({ id: msgId });

      expect(record.subject).toContain('exceeded its send limit');
    });

    it('sends to the postmaster_address', () => {
      const msgId = sendServerSendLimitExceededEmail(
        config,
        serverId,
        'TestServer',
        1000,
        1050,
      );

      const msgDb = provisioner.openServerDb(serverId);
      const msgStore = new MessageStore(msgDb);
      const record = msgStore.findOne({ id: msgId });

      expect(record.rcpt_to).toBe('admin@example.com');
    });
  });

  // ─── sendServerSuspendedEmail ────────────────────────────────

  describe('sendServerSuspendedEmail', () => {
    it('returns a numeric message ID', () => {
      const msgId = sendServerSuspendedEmail(
        config,
        serverId,
        'TestServer',
        'Excessive spam complaints',
      );

      expect(msgId).toBeGreaterThan(0);
    });

    it('includes the suspension reason in the body', () => {
      const msgId = sendServerSuspendedEmail(
        config,
        serverId,
        'TestServer',
        'Excessive spam complaints',
      );

      const msgDb = provisioner.openServerDb(serverId);
      const msgStore = new MessageStore(msgDb);
      const record = msgStore.findOne({ id: msgId });
      const rawBody = msgStore.getRawBody(record);

      expect(rawBody).toContain('Excessive spam complaints');
      expect(rawBody).toContain('suspended');
    });

    it('sets the subject to indicate suspension', () => {
      const msgId = sendServerSuspendedEmail(
        config,
        serverId,
        'TestServer',
        'Policy violation',
      );

      const msgDb = provisioner.openServerDb(serverId);
      const msgStore = new MessageStore(msgDb);
      const record = msgStore.findOne({ id: msgId });

      expect(record.subject).toContain('suspended');
    });
  });

  // ─── sendTestEmail ───────────────────────────────────────────

  describe('sendTestEmail', () => {
    it('returns a numeric message ID', () => {
      const msgId = sendTestEmail(
        config,
        serverId,
        'recipient@test.com',
        'sender@test.com',
      );

      expect(msgId).toBeGreaterThan(0);
    });

    it('sends to the specified recipient', () => {
      const msgId = sendTestEmail(
        config,
        serverId,
        'recipient@test.com',
        'sender@test.com',
      );

      const msgDb = provisioner.openServerDb(serverId);
      const msgStore = new MessageStore(msgDb);
      const record = msgStore.findOne({ id: msgId });

      expect(record.rcpt_to).toBe('recipient@test.com');
      expect(record.mail_from).toBe('sender@test.com');
    });

    it('sets the subject to "Posta SMTP Test Message"', () => {
      const msgId = sendTestEmail(
        config,
        serverId,
        'recipient@test.com',
        'sender@test.com',
      );

      const msgDb = provisioner.openServerDb(serverId);
      const msgStore = new MessageStore(msgDb);
      const record = msgStore.findOne({ id: msgId });

      expect(record.subject).toBe('Posta SMTP Test Message');
    });

    it('generates a valid MIME message', () => {
      const msgId = sendTestEmail(
        config,
        serverId,
        'recipient@test.com',
        'sender@test.com',
      );

      const msgDb = provisioner.openServerDb(serverId);
      const msgStore = new MessageStore(msgDb);
      const record = msgStore.findOne({ id: msgId });
      const rawHeaders = msgStore.getRawHeaders(record);

      expect(rawHeaders).toContain('MIME-Version: 1.0');
      expect(rawHeaders).toContain('Content-Type: text/plain');
      expect(rawHeaders).toContain('To: recipient@test.com');
      expect(rawHeaders).toContain('From: sender@test.com');
    });
  });
});

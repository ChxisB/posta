import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { PostaConfig } from '@posta/core';
import { MessageDatabase } from './database';

/**
 * Represents a single MessageDB migration.
 */
export interface MessageDbMigration {
  version: number;
  name: string;
  up: (db: MessageDatabase) => void;
}

/**
 * Handles per-server SQLite database provisioning and migration.
 *
 * Each server gets its own SQLite file: `posta-server-{id}.db`
 */
export class MessageDbProvisioner {
  private config: PostaConfig;

  constructor(config: PostaConfig) {
    this.config = config;
  }

  /**
   * Get the file path for a server's MessageDB.
   */
  getServerDbPath(serverId: number): string {
    const dir = path.resolve(this.config.message_db.directory);
    return path.join(dir, `${this.config.message_db.database_name_prefix}-server-${serverId}.db`);
  }

  /**
   * Open (or create) a ServerDB, apply pending migrations, and return a MessageDatabase wrapper.
   */
  openServerDb(serverId: number): MessageDatabase {
    const dbPath = this.getServerDbPath(serverId);
    const dir = path.dirname(dbPath);
    mkdirSync(dir, { recursive: true });

    const sqliteDb = new Database(dbPath, { create: true });

    // SQLite pragmas for WAL mode and concurrent access
    sqliteDb.exec('PRAGMA journal_mode = WAL;');
    sqliteDb.exec('PRAGMA busy_timeout = 5000;');
    sqliteDb.exec('PRAGMA foreign_keys = ON;');

    const msgDb = new MessageDatabase(sqliteDb, serverId);

    // Auto-provision the schema and run migrations
    this.ensureSchema(msgDb);
    this.runMigrations(msgDb);

    return msgDb;
  }

  /**
   * Ensure the base schema tables exist.
   */
  private ensureSchema(msgDb: MessageDatabase): void {
    msgDb.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER NOT NULL PRIMARY KEY
      )
    `);
  }

  /**
   * Run all pending migrations on this database.
   */
  private runMigrations(msgDb: MessageDatabase): void {
    const applied = new Set<number>();
    const rows = msgDb.query<{ version: number }>(
      'SELECT version FROM migrations ORDER BY version',
    );
    for (const row of rows) {
      applied.add(row.version);
    }

    for (const migration of ALL_MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      msgDb.transaction(() => {
        migration.up(msgDb);
        msgDb.insert('migrations', { version: migration.version });
      });
    }
  }

  /**
   * Get the current schema version for a server DB.
   */
  getSchemaVersion(msgDb: MessageDatabase): number {
    try {
      const rows = msgDb.query<{ version: number }>(
        'SELECT MAX(version) AS version FROM migrations',
      );
      return rows[0]?.version ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get list of raw message tables older than maxAge days.
   */
  getOldRawTables(msgDb: MessageDatabase, maxAge: number = 30): string[] {
    const cutoff = new Date(Date.now() - maxAge * 86400 * 1000)
      .toISOString()
      .slice(0, 10);

    const tables: string[] = [];
    const rows = msgDb.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'raw-%'`,
    );
    for (const row of rows) {
      const dateStr = row.name.replace(/^raw-/, '');
      if (dateStr < cutoff) {
        tables.push(row.name);
      }
    }
    return tables.sort();
  }

  /**
   * Remove raw message tables older than maxAge days.
   */
  removeOldRawTables(msgDb: MessageDatabase, maxAge: number = 30): void {
    const tables = this.getOldRawTables(msgDb, maxAge);
    for (const table of tables) {
      msgDb.exec(`UPDATE messages SET raw_table = NULL, raw_headers_id = NULL, raw_body_id = NULL, size = NULL WHERE raw_table = '${table}'`);
      msgDb.exec(`DELETE FROM raw_message_sizes WHERE table_name = '${table}'`);
      msgDb.exec(`DROP TABLE IF EXISTS "${table}"`);
    }
  }

  /**
   * Remove messages older than maxAge days.
   */
  removeOldMessages(msgDb: MessageDatabase, maxAge: number = 60): void {
    const cutoff = (Date.now() / 1000) - (maxAge * 86400);
    const newest = msgDb.select<{ id: number }>('messages', {
      where: { timestamp: { less_than_or_equal_to: cutoff } },
      order: 'id',
      direction: 'DESC',
      limit: 1,
      fields: ['id'],
    }) as any as { id: number }[];

    if (newest.length === 0) return;
    const maxId = newest[0].id;
    msgDb.exec(`DELETE FROM clicks WHERE message_id <= ${maxId}`);
    msgDb.exec(`DELETE FROM loads WHERE message_id <= ${maxId}`);
    msgDb.exec(`DELETE FROM deliveries WHERE message_id <= ${maxId}`);
    msgDb.exec(`DELETE FROM spam_checks WHERE message_id <= ${maxId}`);
    msgDb.exec(`DELETE FROM messages WHERE id <= ${maxId}`);
  }

  /**
   * Remove raw tables until total size is under the given MB limit.
   */
  removeRawTablesUntilUnderSize(msgDb: MessageDatabase, sizeMb: number): string[] {
    const tables = msgDb.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'raw-%' ORDER BY name`,
    );
    const removed: string[] = [];
    for (const row of tables) {
      if (msgDb.totalSize() <= sizeMb) break;
      msgDb.exec(`UPDATE messages SET raw_table = NULL, raw_headers_id = NULL, raw_body_id = NULL, size = NULL WHERE raw_table = '${row.name}'`);
      msgDb.exec(`DELETE FROM raw_message_sizes WHERE table_name = '${row.name}'`);
      msgDb.exec(`DROP TABLE IF EXISTS "${row.name}"`);
      removed.push(row.name);
    }
    return removed;
  }

  /**
   * Create a raw message table for a given date.
   */
  createRawTable(msgDb: MessageDatabase, tableName: string): void {
    msgDb.exec(`
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data BLOB,
        next INTEGER
      )
    `);
    // Track the size in raw_message_sizes
    msgDb.insert('raw_message_sizes', { table_name: tableName, size: 0 });
  }

  /**
   * Check if a database file exists for a server.
   */
  serverDbExists(serverId: number): boolean {
    return existsSync(this.getServerDbPath(serverId));
  }
}

/**
 * All MessageDB migrations, ordered by version.
 *
 * These correspond to the 20 MySQL migrations at lib/posta/message_db/migrations/.
 * With SQLite we don't need separate migration files — they're defined inline.
 */
export const ALL_MIGRATIONS: MessageDbMigration[] = [
  {
    version: 1,
    name: 'CreateMigrations',
    up: (db) => {
      // migrations table is created by ensureSchema()
    },
  },
  {
    version: 2,
    name: 'CreateMessages',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT,
          scope TEXT,
          rcpt_to TEXT,
          mail_from TEXT,
          subject TEXT,
          message_id TEXT,
          timestamp REAL,
          route_id INTEGER,
          domain_id INTEGER,
          credential_id INTEGER,
          status TEXT,
          held INTEGER NOT NULL DEFAULT 0,
          size TEXT,
          last_delivery_attempt REAL,
          raw_table TEXT,
          raw_body_id INTEGER,
          raw_headers_id INTEGER,
          inspected INTEGER NOT NULL DEFAULT 0,
          spam INTEGER NOT NULL DEFAULT 0,
          spam_score REAL NOT NULL DEFAULT 0,
          threat INTEGER NOT NULL DEFAULT 0,
          threat_details TEXT,
          bounce INTEGER NOT NULL DEFAULT 0,
          bounce_for_id INTEGER DEFAULT 0,
          tag TEXT,
          loaded REAL,
          clicked REAL,
          received_with_ssl INTEGER
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_token ON messages(token)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_bounce_for ON messages(bounce_for_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_held ON messages(held)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_scope_status ON messages(scope, spam, status, timestamp)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_scope_tag ON messages(scope, spam, tag, timestamp)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_scope_spam ON messages(scope, spam, timestamp)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_scope_threat_status ON messages(scope, threat, status, timestamp)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_scope_threat ON messages(scope, threat, timestamp)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_rcpt_to ON messages(rcpt_to, timestamp)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_mail_from ON messages(mail_from, timestamp)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_raw_table ON messages(raw_table)');
    },
  },
  {
    version: 3,
    name: 'CreateDeliveries',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS deliveries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id INTEGER,
          status TEXT,
          code INTEGER,
          output TEXT,
          details TEXT,
          sent_with_ssl INTEGER NOT NULL DEFAULT 0,
          log_id TEXT,
          timestamp REAL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_deliveries_message ON deliveries(message_id)');
    },
  },
  {
    version: 4,
    name: 'CreateLiveStats',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS live_stats (
          type TEXT NOT NULL,
          minute INTEGER NOT NULL,
          count INTEGER,
          timestamp REAL,
          PRIMARY KEY (minute, type)
        )
      `);
    },
  },
  {
    version: 5,
    name: 'CreateRawMessageSizes',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS raw_message_sizes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT,
          size INTEGER
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_raw_sizes_table ON raw_message_sizes(table_name)');
    },
  },
  {
    version: 6,
    name: 'CreateClicks',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS clicks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id INTEGER,
          link_id INTEGER,
          ip_address TEXT,
          country TEXT,
          city TEXT,
          user_agent TEXT,
          timestamp REAL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_clicks_message ON clicks(message_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_clicks_link ON clicks(link_id)');
    },
  },
  {
    version: 7,
    name: 'CreateLoads',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS loads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id INTEGER,
          ip_address TEXT,
          country TEXT,
          city TEXT,
          user_agent TEXT,
          timestamp REAL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_loads_message ON loads(message_id)');
    },
  },
  {
    version: 8,
    name: 'CreateStats',
    up: (db) => {
      for (const suffix of ['hourly', 'daily', 'monthly', 'yearly']) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS stats_${suffix} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            time INTEGER UNIQUE,
            incoming INTEGER DEFAULT 0,
            outgoing INTEGER DEFAULT 0,
            spam INTEGER DEFAULT 0,
            bounces INTEGER DEFAULT 0,
            held INTEGER DEFAULT 0
          )
        `);
      }
    },
  },
  {
    version: 9,
    name: 'CreateLinks',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS links (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id INTEGER,
          token TEXT,
          hash TEXT,
          url TEXT,
          timestamp REAL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_links_message ON links(message_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_links_token ON links(token)');
    },
  },
  {
    version: 10,
    name: 'CreateSpamChecks',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS spam_checks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id INTEGER,
          score REAL,
          code TEXT,
          description TEXT
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_spam_checks_message ON spam_checks(message_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_spam_checks_code ON spam_checks(code)');
    },
  },
  {
    version: 11,
    name: 'AddTimeToDeliveries',
    up: (db) => {
      db.exec('ALTER TABLE deliveries ADD COLUMN time REAL');
    },
  },
  {
    version: 12,
    name: 'AddHoldExpiry',
    up: (db) => {
      db.exec('ALTER TABLE messages ADD COLUMN hold_expiry REAL');
    },
  },
  {
    version: 13,
    name: 'AddIndexToMessageStatus',
    up: (db) => {
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)');
    },
  },
  {
    version: 14,
    name: 'CreateSuppressions',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS suppressions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT,
          address TEXT,
          reason TEXT,
          timestamp REAL,
          keep_until REAL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_suppressions_address ON suppressions(address)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_suppressions_keep_until ON suppressions(keep_until)');
    },
  },
  {
    version: 15,
    name: 'CreateWebhookRequests',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS webhook_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT,
          event TEXT,
          attempt INTEGER,
          timestamp REAL,
          status_code INTEGER,
          body TEXT,
          payload TEXT,
          will_retry INTEGER
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_webhook_requests_uuid ON webhook_requests(uuid)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_webhook_requests_event ON webhook_requests(event)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_webhook_requests_timestamp ON webhook_requests(timestamp)');
    },
  },
  {
    version: 16,
    name: 'AddUrlAndHookToWebhooks',
    up: (db) => {
      db.exec('ALTER TABLE webhook_requests ADD COLUMN url TEXT');
      db.exec('ALTER TABLE webhook_requests ADD COLUMN webhook_id INTEGER');
      db.exec('CREATE INDEX IF NOT EXISTS idx_webhook_requests_webhook ON webhook_requests(webhook_id)');
    },
  },
  {
    version: 17,
    name: 'AddReplacedLinkCountToMessages',
    up: (db) => {
      db.exec('ALTER TABLE messages ADD COLUMN tracked_links INTEGER DEFAULT 0');
      db.exec('ALTER TABLE messages ADD COLUMN tracked_images INTEGER DEFAULT 0');
      db.exec('ALTER TABLE messages ADD COLUMN parsed INTEGER DEFAULT 0');
    },
  },
  {
    version: 18,
    name: 'AddEndpointsToMessages',
    up: (db) => {
      db.exec('ALTER TABLE messages ADD COLUMN endpoint_id INTEGER');
      db.exec('ALTER TABLE messages ADD COLUMN endpoint_type TEXT');
    },
  },
  {
    version: 19,
    name: 'ConvertToUtf8',
    up: () => {
      // No-op — SQLite uses UTF-8 natively
    },
  },
  {
    version: 20,
    name: 'IncreaseLinksUrlSize',
    up: () => {
      // No-op — SQLite TEXT has no size limit
    },
  },
];

import type { PostaConfig, Queryable } from '@posta/core';
import { ensureServerSchema, getServerSchemaName } from '@posta/core';
import { MessageDatabase } from './database';

/**
 * Represents a single MessageDB migration.
 */
export interface MessageDbMigration {
  version: number;
  name: string;
  up: (db: MessageDatabase) => Promise<void>;
}

/**
 * Handles per-server PostgreSQL schema provisioning and migration.
 *
 * Each server gets its own PostgreSQL schema: `posta_server_{id}`
 */
export class MessageDbProvisioner {
  private config: PostaConfig;

  constructor(config: PostaConfig) {
    this.config = config;
  }

  /**
   * Get the PostgreSQL schema name for a server's MessageDB.
   */
  getServerSchemaName(serverId: number): string {
    return getServerSchemaName(this.config, serverId);
  }

  /**
   * Open (or create) a ServerDB, apply pending migrations, and return a MessageDatabase wrapper.
   */
  async openServerDb(serverId: number, client: Queryable): Promise<MessageDatabase> {
    const msgDb = new MessageDatabase(client, serverId);

    // Ensure the per-server schema exists
    await ensureServerSchema(client, this.config, serverId);
    await msgDb.exec(`SET search_path TO "${this.getServerSchemaName(serverId)}", public`);

    // Auto-provision the schema and run migrations
    await this.ensureSchema(msgDb);
    await this.runMigrations(msgDb);

    return msgDb;
  }

  /**
   * Ensure the base schema tables exist.
   */
  private async ensureSchema(msgDb: MessageDatabase): Promise<void> {
    await msgDb.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER NOT NULL PRIMARY KEY
      )
    `);
  }

  /**
   * Run all pending migrations on this database.
   */
  private async runMigrations(msgDb: MessageDatabase): Promise<void> {
    const applied = new Set<number>();
    const rows = await msgDb.query<{ version: number }>(
      'SELECT version FROM migrations ORDER BY version',
    );
    for (const row of rows) {
      applied.add(row.version);
    }

    for (const migration of ALL_MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      await msgDb.transaction(async () => {
        await migration.up(msgDb);
        await msgDb.insert('migrations', { version: migration.version });
      });
    }
  }

  /**
   * Get the current schema version for a server DB.
   */
  async getSchemaVersion(msgDb: MessageDatabase): Promise<number> {
    try {
      const rows = await msgDb.query<{ version: number }>(
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
  async getOldRawTables(msgDb: MessageDatabase, maxAge: number = 30): Promise<string[]> {
    const cutoff = new Date(Date.now() - maxAge * 86400 * 1000)
      .toISOString()
      .slice(0, 10);

    const tables: string[] = [];
    const rows = await msgDb.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name LIKE 'raw-%'`,
    );
    for (const row of rows) {
      const dateStr = row.table_name.replace(/^raw-/, '');
      if (dateStr < cutoff) {
        tables.push(row.table_name);
      }
    }
    return tables.sort();
  }

  /**
   * Remove raw message tables older than maxAge days.
   */
  async removeOldRawTables(msgDb: MessageDatabase, maxAge: number = 30): Promise<void> {
    const tables = await this.getOldRawTables(msgDb, maxAge);
    for (const table of tables) {
      await msgDb.exec(`UPDATE messages SET raw_table = NULL, raw_headers_id = NULL, raw_body_id = NULL, size = NULL WHERE raw_table = '${table}'`);
      await msgDb.exec(`DELETE FROM raw_message_sizes WHERE table_name = '${table}'`);
      await msgDb.exec(`DROP TABLE IF EXISTS "${table}"`);
    }
  }

  /**
   * Remove messages older than maxAge days.
   */
  async removeOldMessages(msgDb: MessageDatabase, maxAge: number = 60): Promise<void> {
    const cutoff = (Date.now() / 1000) - (maxAge * 86400);
    const newest = await msgDb.select<{ id: number }>('messages', {
      where: { timestamp: { less_than_or_equal_to: cutoff } },
      order: 'id',
      direction: 'DESC',
      limit: 1,
      fields: ['id'],
    }) as any as { id: number }[];

    if (!Array.isArray(newest) || newest.length === 0) return;
    const maxId = newest[0].id;
    await msgDb.exec(`DELETE FROM clicks WHERE message_id <= ${maxId}`);
    await msgDb.exec(`DELETE FROM loads WHERE message_id <= ${maxId}`);
    await msgDb.exec(`DELETE FROM deliveries WHERE message_id <= ${maxId}`);
    await msgDb.exec(`DELETE FROM spam_checks WHERE message_id <= ${maxId}`);
    await msgDb.exec(`DELETE FROM messages WHERE id <= ${maxId}`);
  }

  /**
   * Remove raw tables until total size is under the given MB limit.
   */
  async removeRawTablesUntilUnderSize(msgDb: MessageDatabase, sizeMb: number): Promise<string[]> {
    const tables = await msgDb.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name LIKE 'raw-%' ORDER BY table_name`,
    );
    const removed: string[] = [];
    for (const row of tables) {
      if ((await msgDb.totalSize()) <= sizeMb) break;
      await msgDb.exec(`UPDATE messages SET raw_table = NULL, raw_headers_id = NULL, raw_body_id = NULL, size = NULL WHERE raw_table = '${row.table_name}'`);
      await msgDb.exec(`DELETE FROM raw_message_sizes WHERE table_name = '${row.table_name}'`);
      await msgDb.exec(`DROP TABLE IF EXISTS "${row.table_name}"`);
      removed.push(row.table_name);
    }
    return removed;
  }

  /**
   * Create a raw message table for a given date.
   */
  async createRawTable(msgDb: MessageDatabase, tableName: string): Promise<void> {
    await msgDb.exec(`
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        id SERIAL PRIMARY KEY,
        data BYTEA,
        next INTEGER
      )
    `);
    // Track the size in raw_message_sizes
    await msgDb.insert('raw_message_sizes', { table_name: tableName, size: 0 });
  }

  /**
   * Check if a server schema exists.
   */
  async serverDbExists(serverId: number, client: Queryable): Promise<boolean> {
    const schema = this.getServerSchemaName(serverId);
    const rows = await client.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM information_schema.schemata WHERE schema_name = $1`,
      [schema],
    );
    return (rows[0]?.count ?? 0) > 0;
  }
}

/**
 * All MessageDB migrations, ordered by version.
 *
 * These correspond to the 20 MySQL migrations at lib/posta/message_db/migrations/.
 * With PostgreSQL we define them inline.
 */
export const ALL_MIGRATIONS: MessageDbMigration[] = [
  {
    version: 1,
    name: 'CreateMigrations',
    up: async () => {
      // migrations table is created by ensureSchema()
    },
  },
  {
    version: 2,
    name: 'CreateMessages',
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
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
      await db.exec('CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_messages_token ON messages(token)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_messages_bounce_for ON messages(bounce_for_id)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_messages_held ON messages(held)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_messages_scope_status ON messages(scope, spam, status, timestamp)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_messages_scope_tag ON messages(scope, spam, tag, timestamp)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_messages_scope_spam ON messages(scope, spam, timestamp)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_messages_scope_threat_status ON messages(scope, threat, status, timestamp)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_messages_scope_threat ON messages(scope, threat, timestamp)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_messages_rcpt_to ON messages(rcpt_to, timestamp)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_messages_mail_from ON messages(mail_from, timestamp)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_messages_raw_table ON messages(raw_table)');
    },
  },
  {
    version: 3,
    name: 'CreateDeliveries',
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS deliveries (
          id SERIAL PRIMARY KEY,
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
      await db.exec('CREATE INDEX IF NOT EXISTS idx_deliveries_message ON deliveries(message_id)');
    },
  },
  {
    version: 4,
    name: 'CreateLiveStats',
    up: async (db) => {
      await db.exec(`
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
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS raw_message_sizes (
          id SERIAL PRIMARY KEY,
          table_name TEXT,
          size INTEGER
        )
      `);
      await db.exec('CREATE INDEX IF NOT EXISTS idx_raw_sizes_table ON raw_message_sizes(table_name)');
    },
  },
  {
    version: 6,
    name: 'CreateClicks',
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS clicks (
          id SERIAL PRIMARY KEY,
          message_id INTEGER,
          link_id INTEGER,
          ip_address TEXT,
          country TEXT,
          city TEXT,
          user_agent TEXT,
          timestamp REAL
        )
      `);
      await db.exec('CREATE INDEX IF NOT EXISTS idx_clicks_message ON clicks(message_id)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_clicks_link ON clicks(link_id)');
    },
  },
  {
    version: 7,
    name: 'CreateLoads',
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS loads (
          id SERIAL PRIMARY KEY,
          message_id INTEGER,
          ip_address TEXT,
          country TEXT,
          city TEXT,
          user_agent TEXT,
          timestamp REAL
        )
      `);
      await db.exec('CREATE INDEX IF NOT EXISTS idx_loads_message ON loads(message_id)');
    },
  },
  {
    version: 8,
    name: 'CreateStats',
    up: async (db) => {
      for (const suffix of ['hourly', 'daily', 'monthly', 'yearly']) {
        await db.exec(`
          CREATE TABLE IF NOT EXISTS stats_${suffix} (
            id SERIAL PRIMARY KEY,
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
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS links (
          id SERIAL PRIMARY KEY,
          message_id INTEGER,
          token TEXT,
          hash TEXT,
          url TEXT,
          timestamp REAL
        )
      `);
      await db.exec('CREATE INDEX IF NOT EXISTS idx_links_message ON links(message_id)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_links_token ON links(token)');
    },
  },
  {
    version: 10,
    name: 'CreateSpamChecks',
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS spam_checks (
          id SERIAL PRIMARY KEY,
          message_id INTEGER,
          score REAL,
          code TEXT,
          description TEXT
        )
      `);
      await db.exec('CREATE INDEX IF NOT EXISTS idx_spam_checks_message ON spam_checks(message_id)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_spam_checks_code ON spam_checks(code)');
    },
  },
  {
    version: 11,
    name: 'AddTimeToDeliveries',
    up: async (db) => {
      await db.exec('ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS time REAL');
    },
  },
  {
    version: 12,
    name: 'AddHoldExpiry',
    up: async (db) => {
      await db.exec('ALTER TABLE messages ADD COLUMN IF NOT EXISTS hold_expiry REAL');
    },
  },
  {
    version: 13,
    name: 'AddIndexToMessageStatus',
    up: async (db) => {
      await db.exec('CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)');
    },
  },
  {
    version: 14,
    name: 'CreateSuppressions',
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS suppressions (
          id SERIAL PRIMARY KEY,
          type TEXT,
          address TEXT,
          reason TEXT,
          timestamp REAL,
          keep_until REAL
        )
      `);
      await db.exec('CREATE INDEX IF NOT EXISTS idx_suppressions_address ON suppressions(address)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_suppressions_keep_until ON suppressions(keep_until)');
    },
  },
  {
    version: 15,
    name: 'CreateWebhookRequests',
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS webhook_requests (
          id SERIAL PRIMARY KEY,
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
      await db.exec('CREATE INDEX IF NOT EXISTS idx_webhook_requests_uuid ON webhook_requests(uuid)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_webhook_requests_event ON webhook_requests(event)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_webhook_requests_timestamp ON webhook_requests(timestamp)');
    },
  },
  {
    version: 16,
    name: 'AddUrlAndHookToWebhooks',
    up: async (db) => {
      await db.exec('ALTER TABLE webhook_requests ADD COLUMN IF NOT EXISTS url TEXT');
      await db.exec('ALTER TABLE webhook_requests ADD COLUMN IF NOT EXISTS webhook_id INTEGER');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_webhook_requests_webhook ON webhook_requests(webhook_id)');
    },
  },
  {
    version: 17,
    name: 'AddReplacedLinkCountToMessages',
    up: async (db) => {
      await db.exec('ALTER TABLE messages ADD COLUMN IF NOT EXISTS tracked_links INTEGER DEFAULT 0');
      await db.exec('ALTER TABLE messages ADD COLUMN IF NOT EXISTS tracked_images INTEGER DEFAULT 0');
      await db.exec('ALTER TABLE messages ADD COLUMN IF NOT EXISTS parsed INTEGER DEFAULT 0');
    },
  },
  {
    version: 18,
    name: 'AddEndpointsToMessages',
    up: async (db) => {
      await db.exec('ALTER TABLE messages ADD COLUMN IF NOT EXISTS endpoint_id INTEGER');
      await db.exec('ALTER TABLE messages ADD COLUMN IF NOT EXISTS endpoint_type TEXT');
    },
  },
  {
    version: 19,
    name: 'ConvertToUtf8',
    up: async () => {
      // No-op — PostgreSQL uses UTF-8 natively
    },
  },
  {
    version: 20,
    name: 'IncreaseLinksUrlSize',
    up: async () => {
      // No-op — PostgreSQL TEXT has no size limit
    },
  },
];

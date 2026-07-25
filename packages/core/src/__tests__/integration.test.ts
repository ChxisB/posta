import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { loadConfig, runMigrations, MAIN_DB_DDL } from '../index';
import { getMainDb } from '../db/index';
import { Database } from 'bun:sqlite';
import { unlinkSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

/**
 * Integration tests for the main database: schema creation, migrations, CRUD.
 */
describe('Main DB Integration', () => {
  const testDbPath = path.join(process.cwd(), '.test-data', 'test-main.db');

  beforeAll(() => {
    // Clean up any previous test data
    const dir = path.dirname(testDbPath);
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
  });

  afterAll(() => {
    // Clean up test data
    const dir = path.dirname(testDbPath);
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  });

  it('creates a SQLite database with WAL mode', () => {
    const db = new Database(testDbPath, { create: true });
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec('PRAGMA foreign_keys = ON;');

    const busyTimeout = db.query('PRAGMA busy_timeout').get() as any;
    expect(busyTimeout.timeout).toBe(5000);

    db.close();
  });

  it('runs the main DB DDL without errors', () => {
    const db = new Database(testDbPath, { create: true });
    db.exec(MAIN_DB_DDL);
    db.close();
  });

  it('creates all expected tables', () => {
    const db = new Database(testDbPath, { create: true });
    db.exec(MAIN_DB_DDL);

    const expectedTables = [
      'users', 'organizations', 'servers', 'credentials', 'domains',
      'routes', 'http_endpoints', 'smtp_endpoints', 'address_endpoints',
      'ip_pools', 'queued_messages', 'webhooks', 'webhook_requests',
      'worker_roles', 'scheduled_tasks',
    ];

    const tables = db.query(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
    ).all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);

    for (const table of expectedTables) {
      expect(tableNames).toContain(table);
    }

    db.close();
  });

  it('runs migrations via the migration runner', () => {
    const db = new Database(testDbPath, { create: true });

    const migrations = [
      {
        version: 1,
        name: 'InitialSchema',
        up: (d: Database) => {
          d.exec('CREATE TABLE IF NOT EXISTS test_migrations (id INTEGER PRIMARY KEY, name TEXT)');
        },
      },
      {
        version: 2,
        name: 'AddColumn',
        up: (d: Database) => {
          d.exec('ALTER TABLE test_migrations ADD COLUMN created_at TEXT');
        },
      },
    ];

    runMigrations(db, migrations);

    // Verify migrations were applied
    const applied = db.query(
      'SELECT version, name FROM schema_migrations ORDER BY version',
    ).all() as { version: number; name: string }[];

    expect(applied.length).toBe(2);
    expect(applied[0].version).toBe(1);
    expect(applied[0].name).toBe('InitialSchema');
    expect(applied[1].version).toBe(2);
    expect(applied[1].name).toBe('AddColumn');

    // Running again should be a no-op
    runMigrations(db, migrations);

    const stillApplied = db.query(
      'SELECT COUNT(*) as count FROM schema_migrations',
    ).get() as { count: number };
    expect(stillApplied.count).toBe(2);

    db.close();
  });

  it('loads config from environment variables', () => {
    process.env.POSTA_MAIN_DB_PATH = testDbPath;
    process.env.POSTA_LOG_LEVEL = 'debug';
    process.env.POSTA_WEB_HOSTNAME = 'test.example.com';
    // Point to /dev/null so no YAML file is loaded — all defaults apply
    process.env.POSTA_CONFIG_FILE_PATH = '/dev/null';

    const config = loadConfig();
    expect(config.main_db.path).toBe(testDbPath);
    expect(config.logging.level).toBe('debug');
    expect(config.posta.web_hostname).toBe('test.example.com');
  });
});

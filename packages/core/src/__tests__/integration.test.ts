import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { loadConfig, runMigrations, MAIN_DB_DDL } from '../index';
import { getMainDb, closeAllDatabases } from '../db/index';
import type { Queryable } from '../db/client';

/**
 * Integration tests for the main database: schema creation, migrations, CRUD.
 *
 * These tests require a running PostgreSQL database. Set POSTA_MAIN_DB_URL
 * to a test database before running (e.g. via docker run -e POSTGRES_PASSWORD=postgres postgres).
 */
const testDbUrl = process.env.POSTA_MAIN_DB_URL || 'postgresql://postgres:postgres@localhost:5432/posta_test';

function loadTestConfig(url: string) {
  process.env.POSTA_MAIN_DB_URL = url;
  process.env.POSTA_CONFIG_FILE_PATH = '/dev/null';
  return loadConfig();
}

describe('Main DB Integration', () => {
  beforeAll(async () => {
    // Clean up any previous test data
    const client = getMainDb(loadTestConfig(testDbUrl));
    await client.exec(`
      DROP TABLE IF EXISTS schema_migrations, test_migrations CASCADE;
      DROP TABLE IF EXISTS users, organizations, organization_users, servers, credentials, domains,
        routes, http_endpoints, smtp_endpoints, address_endpoints, additional_route_endpoints,
        ip_pools, ip_pool_rules, ip_addresses, organization_ip_pools, queued_messages,
        webhooks, webhook_events, webhook_requests, worker_roles, scheduled_tasks,
        track_certificates, track_domains, user_invites, statistics, failed_messages CASCADE;
    `);
  });

  afterAll(async () => {
    await closeAllDatabases();
  });

  it('runs the main DB DDL without errors', async () => {
    const client = getMainDb(loadTestConfig(testDbUrl));
    await client.exec(MAIN_DB_DDL);
  });

  it('runs migrations via the migration runner', async () => {
    const client = getMainDb(loadTestConfig(testDbUrl));

    const migrations = [
      {
        version: 1,
        name: 'InitialSchema',
        up: async (d: Queryable) => {
          await d.exec('CREATE TABLE IF NOT EXISTS test_migrations (id SERIAL PRIMARY KEY, name TEXT)');
        },
      },
      {
        version: 2,
        name: 'AddColumn',
        up: async (d: Queryable) => {
          await d.exec('ALTER TABLE test_migrations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ');
        },
      },
    ];

    await runMigrations(client, migrations);

    // Verify migrations were applied
    const applied = await client.query<{ version: number; name: string }>(
      'SELECT version, name FROM schema_migrations ORDER BY version',
    );

    expect(applied.length).toBe(2);
    expect(applied[0].version).toBe(1);
    expect(applied[0].name).toBe('InitialSchema');
    expect(applied[1].version).toBe(2);
    expect(applied[1].name).toBe('AddColumn');

    // Running again should be a no-op
    await runMigrations(client, migrations);

    const stillApplied = await client.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM schema_migrations',
    );
    expect(stillApplied?.count).toBe(2);
  });

  it('loads config from environment variables', async () => {
    process.env.POSTA_MAIN_DB_URL = testDbUrl;
    process.env.POSTA_LOG_LEVEL = 'debug';
    process.env.POSTA_WEB_HOSTNAME = 'test.example.com';
    // Point to /dev/null so no YAML file is loaded — all defaults apply
    process.env.POSTA_CONFIG_FILE_PATH = '/dev/null';

    const config = loadConfig();
    expect(config.main_db.url).toBe(testDbUrl);
    expect(config.logging.level).toBe('debug');
    expect(config.posta.web_hostname).toBe('test.example.com');
  });
});

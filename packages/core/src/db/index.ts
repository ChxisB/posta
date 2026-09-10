import type { PostaConfig } from '../config/types';
import { PgClient, type Queryable } from './client';
import { MAIN_DB_DDL } from './schema';

interface DbConnection {
  client: PgClient;
  url: string;
}

let mainDbConnection: DbConnection | null = null;
const serverDbConnections = new Map<number, DbConnection>();

/**
 * Get or create the main PostgreSQL database connection.
 */
export function getMainDb(config: PostaConfig): PgClient {
  if (mainDbConnection) return mainDbConnection.client;

  const client = new PgClient(config.main_db.url);
  mainDbConnection = { client, url: config.main_db.url };
  return client;
}

/**
 * Get or create a per-server MessageDB PostgreSQL connection.
 *
 * Servers are isolated using a dedicated PostgreSQL schema named
 * `{message_db.schema_prefix}_{serverId}`. The underlying connection is
 * the same as the main database unless a separate message_db.url is configured.
 */
export function getServerDb(config: PostaConfig, serverId: number): PgClient {
  const existing = serverDbConnections.get(serverId);
  if (existing) return existing.client;

  const baseUrl = config.message_db.url ?? config.main_db.url;
  const schema = getServerSchemaName(config, serverId);
  const url = setSearchPath(baseUrl, `${schema},public`);
  const client = new PgClient(url);
  serverDbConnections.set(serverId, { client, url });
  return client;
}

function setSearchPath(url: string, searchPath: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('search_path', searchPath);
  return parsed.toString();
}

/**
 * Close all database connections.
 */
export async function closeAllDatabases(): Promise<void> {
  if (mainDbConnection) {
    await mainDbConnection.client.close();
    mainDbConnection = null;
  }
  for (const conn of serverDbConnections.values()) {
    await conn.client.close();
  }
  serverDbConnections.clear();
}

/**
 * Initialize the main database: create tables.
 * Call this at startup before any service starts.
 */
export async function initializeMainDb(config: PostaConfig): Promise<PgClient> {
  const client = getMainDb(config);
  await client.exec(MAIN_DB_DDL);
  console.log('[db] Main database initialized');
  return client;
}

/**
 * Initialize the database standalone (for SMTP server / worker).
 * Same as initializeMainDb but returns the client immediately.
 */
export function initializeDatabase(config: PostaConfig): PgClient {
  return getMainDb(config);
}

/**
 * Create a queued message entry for delivery.
 * Inserts into the queued_messages table so the worker can pick it up.
 */
export async function createQueuedMessage(
  client: PgClient,
  params: {
    serverId: number;
    messageId: number;
    domainId?: number | null;
    retryAfter?: Date;
    priority?: number;
    maxAttempts?: number;
    ipAddressId?: number | null;
  },
): Promise<number> {
  const result = await client.run(
    `INSERT INTO queued_messages
      (server_id, message_id, domain_id, retry_after, priority, max_attempts, ip_address_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     RETURNING id`,
    [
      params.serverId,
      params.messageId,
      params.domainId ?? null,
      params.retryAfter?.toISOString() ?? null,
      params.priority ?? 0,
      params.maxAttempts ?? 18,
      params.ipAddressId ?? null,
    ],
  );
  return Number(result.lastInsertRowid);
}

/**
 * Format a PostgreSQL schema name for a server's MessageDB.
 */
export function getServerSchemaName(config: PostaConfig, serverId: number): string {
  return `${config.message_db.schema_prefix}_${serverId}`;
}

/**
 * Set the search_path for a connection to the given schema.
 * The search_path is scoped to the current session/connection.
 */
export async function useServerSchema(client: Queryable, config: PostaConfig, serverId: number): Promise<void> {
  const schema = getServerSchemaName(config, serverId);
  await client.run(`SET search_path TO "${schema}", public`);
}

/**
 * Ensure a server schema exists.
 */
export async function ensureServerSchema(client: Queryable, config: PostaConfig, serverId: number): Promise<void> {
  const schema = getServerSchemaName(config, serverId);
  await client.run(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
}

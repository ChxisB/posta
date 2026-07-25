import { Database } from 'bun:sqlite';
import path from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { MAIN_DB_DDL } from './schema';
import type { PostaConfig } from '../config/types';

interface DbConnection {
  db: Database;
  path: string;
}

let mainDbConnection: DbConnection | null = null;
const serverDbConnections = new Map<number, DbConnection>();

/**
 * Get or create the main SQLite database connection.
 * Uses WAL mode with busy_timeout for concurrent access.
 */
export function getMainDb(config: PostaConfig): Database {
  if (mainDbConnection) return mainDbConnection.db;

  const dbPath = path.resolve(config.main_db.path);
  const dir = path.dirname(dbPath);
  mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath, { create: true });
  configureDatabase(db);
  mainDbConnection = { db, path: dbPath };
  return db;
}

/**
 * Get or create a per-server MessageDB SQLite connection.
 * One SQLite file per server, stored in the message_db directory.
 */
export function getServerDb(config: PostaConfig, serverId: number): Database {
  const existing = serverDbConnections.get(serverId);
  if (existing) return existing.db;

  const dir = path.resolve(config.message_db.directory);
  mkdirSync(dir, { recursive: true });

  const dbPath = path.join(dir, `${config.message_db.database_name_prefix}-server-${serverId}.db`);
  const db = new Database(dbPath, { create: true });
  configureDatabase(db);
  serverDbConnections.set(serverId, { db, path: dbPath });
  return db;
}

/**
 * Configure a SQLite database with WAL mode and busy timeout.
 */
function configureDatabase(db: Database): void {
  // Enable WAL mode for concurrent read performance
  db.exec('PRAGMA journal_mode = WAL;');
  // Normal sync is faster than FULL and safe with WAL
  db.exec('PRAGMA synchronous = NORMAL;');
  // Busy timeout in milliseconds — wait up to 5s if another process is writing
  db.exec('PRAGMA busy_timeout = 5000;');
  // Enable foreign keys
  db.exec('PRAGMA foreign_keys = ON;');
  // Set cache size to 64MB (-kBytes)
  db.exec('PRAGMA cache_size = -64000;');
  // Keep temp tables in memory for speed
  db.exec('PRAGMA temp_store = MEMORY;');
}

/**
 * Close all database connections.
 */
export function closeAllDatabases(): void {
  if (mainDbConnection) {
    mainDbConnection.db.close();
    mainDbConnection = null;
  }
  for (const conn of serverDbConnections.values()) {
    conn.db.close();
  }
  serverDbConnections.clear();
}

/**
 * Initialize the main database: create tables and configure PRAGMAs.
 * Call this at startup before any service starts.
 */
export function initializeMainDb(config: PostaConfig): Database {
  const db = getMainDb(config);
  db.exec(MAIN_DB_DDL);
  console.log('[db] Main database initialized');

  // Ensure the MessageDB directory exists
  const msgDir = path.resolve(config.message_db.directory);
  if (!existsSync(msgDir)) {
    mkdirSync(msgDir, { recursive: true });
    console.log(`[db] Created MessageDB directory: ${msgDir}`);
  }

  return db;
}

/**
 * Initialize the database standalone (for SMTP server / worker).
 * Same as initializeMainDb but returns the DB immediately.
 */
export function initializeDatabase(config: PostaConfig): Database {
  return initializeMainDb(config);
}

/**
 * Create a queued message entry for delivery.
 * Inserts into the queued_messages table so the worker can pick it up.
 */
export function createQueuedMessage(
  db: Database,
  params: {
    serverId: number;
    messageId: number;
    domainId?: number | null;
    retryAfter?: Date;
    priority?: number;
    maxAttempts?: number;
    ipAddressId?: number | null;
  },
): number {
  const serverId = params.serverId; // type-safe reference
  const stmt = db.prepare(`
    INSERT INTO queued_messages (server_id, message_id, domain_id, retry_after, priority, max_attempts, ip_address_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  const result = stmt.run(
    params.serverId,
    params.messageId,
    params.domainId ?? null,
    params.retryAfter?.toISOString() ?? null,
    params.priority ?? 0,
    params.maxAttempts ?? 18,
    params.ipAddressId ?? null,
  );
  return Number(result.lastInsertRowid);
}

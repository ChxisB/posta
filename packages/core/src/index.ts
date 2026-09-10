export { loadConfig, type PostaConfig } from './config/index';
export { createLogger, type PostaLogger } from './logger/index';
export { getMainDb, getServerDb, closeAllDatabases, initializeMainDb, initializeDatabase, createQueuedMessage, getServerSchemaName, ensureServerSchema, useServerSchema } from './db/index';
export { PgClient } from './db/client';
export type { Sql, Row, RunResult, Queryable } from './db/client';
export { runMigrations, getMigrationVersion, type Migration } from './db/migrations';
export { MAIN_DB_DDL } from './db/schema';
export {
  MESSAGE_STORE_DDL,
  PARTITIONED_TABLES,
  partitionDDL,
  partitionsToEnsure,
} from './db/schema-v2';
export { splitStatements } from './db/client';
export * from './types/index';

// Phase 2 additions
export { DnsResolver } from './dns/index';
export { stripNameFromAddress } from './helpers';
export { allocateIpAddress } from './ip_pools';
export { QueryString } from './query_string';
export { HttpClient, BlockedDestinationError } from './http/index';
export type { HttpResponse, HttpRequestOptions } from './http/index';
export { IPAddressGuard } from './http/address_guard';
export { Signer } from './crypto/signer';
export { DkimHeader } from './crypto/dkim';

// Inspectors (spam/virus scanning)
export { checkWithRspamd, scanWithClamav, checkWithSpamAssassin } from './inspectors/index';
export type { SpamCheck, RspamdConfig, ClamavConfig, ClamavResult, SpamAssassinConfig, SpamAssassinCheck, SpamAssassinResult } from './inspectors/index';

import { readFileSync, existsSync } from 'node:fs';
import * as yaml from 'js-yaml';
import type { PostaConfig } from './types';
import { PostaConfigSchema } from './schema';

export { type PostaConfig } from './types';

/**
 * Load Posta configuration from YAML file + environment variable overrides.
 *
 * Mirrors the Ruby config in lib/posta/config.rb:
 * 1. Loads .env if present
 * 2. Loads posta.yml (v1 legacy or v2 format)
 * 3. Environment variable overrides take highest priority
 */
export function loadConfig(configFilePath?: string): PostaConfig {
  const filePath = configFilePath ?? process.env.POSTA_CONFIG_FILE_PATH ?? 'config/posta/posta.yml';

  // Start with empty config — Zod defaults fill in missing values
  const raw: Record<string, any> = {};

  // Load YAML config file if it exists
  if (existsSync(filePath)) {
    const fileContent = readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(fileContent) as Record<string, any> | undefined;
    if (parsed) {
      const version = (parsed.version as number) ?? 1;
      // Merge all known sections from YAML
      for (const key of ['posta', 'web_server', 'worker', 'main_db', 'message_db',
        'logging', 'gelf', 'smtp_server', 'dns', 'smtp',
        'rspamd', 'spamd', 'clamav', 'smtp_client']) {
        if (parsed[key]) {
          raw[key] = { ...raw[key], ...parsed[key] as Record<string, any> };
        }
      }
    }
  }

  // Apply environment variable overrides
  applyEnvOverrides(raw);

  // Parse and validate through Zod — defaults fill in missing required fields
  const result = PostaConfigSchema.parse(raw);
  return result as PostaConfig;
}

/**
 * Apply environment variable overrides to the config object.
 * Follows the same convention as the Ruby version: POSTA_* env vars.
 */
function applyEnvOverrides(raw: Record<string, any>): void {
  const env = process.env;

  // General
  if (env.POSTA_WEB_HOSTNAME) setNested(raw, ['posta', 'web_hostname'], env.POSTA_WEB_HOSTNAME);
  if (env.POSTA_WEB_PROTOCOL) setNested(raw, ['posta', 'web_protocol'], env.POSTA_WEB_PROTOCOL);
  if (env.POSTA_SMTP_HOSTNAME) setNested(raw, ['posta', 'smtp_hostname'], env.POSTA_SMTP_HOSTNAME);
  if (env.POSTA_USE_IP_POOLS) setNested(raw, ['posta', 'use_ip_pools'], env.POSTA_USE_IP_POOLS === 'true');
  if (env.POSTA_SIGNING_KEY_PATH) setNested(raw, ['posta', 'signing_key_path'], env.POSTA_SIGNING_KEY_PATH);

  // SMTP Relays
  if (env.POSTA_SMTP_RELAYS) {
    try {
      setNested(raw, ['posta', 'smtp_relays'], JSON.parse(env.POSTA_SMTP_RELAYS));
    } catch { /* ignore invalid JSON */ }
  }

  // Web server
  if (env.PORT) setNested(raw, ['web_server', 'default_port'], parseInt(env.PORT, 10));
  if (env.BIND_ADDRESS) setNested(raw, ['web_server', 'default_bind_address'], env.BIND_ADDRESS);

  // Worker
  if (env.WORKER_THREADS) setNested(raw, ['worker', 'threads'], parseInt(env.WORKER_THREADS, 10));

  // Main DB (PostgreSQL connection URL)
  if (env.POSTA_MAIN_DB_URL) setNested(raw, ['main_db', 'url'], env.POSTA_MAIN_DB_URL);

  // Message DB (optional separate PostgreSQL connection URL and schema prefix)
  if (env.POSTA_MESSAGE_DB_URL) setNested(raw, ['message_db', 'url'], env.POSTA_MESSAGE_DB_URL);
  if (env.POSTA_MESSAGE_DB_SCHEMA_PREFIX) setNested(raw, ['message_db', 'schema_prefix'], env.POSTA_MESSAGE_DB_SCHEMA_PREFIX);

  // Logging
  if (env.POSTA_LOG_LEVEL) setNested(raw, ['logging', 'level'], env.POSTA_LOG_LEVEL);
  if (env.POSTA_SENTRY_DSN) setNested(raw, ['logging', 'sentry_dsn'], env.POSTA_SENTRY_DSN);

  // GELF
  if (env.POSTA_GELF_HOST) setNested(raw, ['gelf', 'host'], env.POSTA_GELF_HOST);
  if (env.POSTA_GELF_PORT) setNested(raw, ['gelf', 'port'], parseInt(env.POSTA_GELF_PORT, 10));

  // SMTP server
  if (env.SMTP_PORT) setNested(raw, ['smtp_server', 'default_port'], parseInt(env.SMTP_PORT, 10));
  if (env.SMTP_BIND_ADDRESS) setNested(raw, ['smtp_server', 'default_bind_address'], env.SMTP_BIND_ADDRESS);
  if (env.SMTP_TLS_ENABLED) setNested(raw, ['smtp_server', 'tls_enabled'], env.SMTP_TLS_ENABLED === 'true');
  if (env.POSTA_MAX_MESSAGE_SIZE) setNested(raw, ['smtp_server', 'max_message_size'], parseInt(env.POSTA_MAX_MESSAGE_SIZE, 10));

  // DNS
  if (env.POSTA_DKIM_IDENTIFIER) setNested(raw, ['dns', 'dkim_identifier'], env.POSTA_DKIM_IDENTIFIER);

  // SMTP client
  if (env.POSTA_SMTP_OPEN_TIMEOUT) setNested(raw, ['smtp_client', 'open_timeout'], parseInt(env.POSTA_SMTP_OPEN_TIMEOUT, 10));
  if (env.POSTA_SMTP_READ_TIMEOUT) setNested(raw, ['smtp_client', 'read_timeout'], parseInt(env.POSTA_SMTP_READ_TIMEOUT, 10));
}

/**
 * Set a value in a nested object by path, creating intermediate objects as needed.
 */
function setNested(obj: Record<string, any>, path: string[], value: unknown): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}

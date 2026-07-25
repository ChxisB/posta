/**
 * Main database DDL — SQLite-compatible CREATE TABLE statements.
 *
 * Derived from db/schema.rb (Rails ActiveRecord schema).
 * Notable changes from MySQL:
 * - Removed charset/collation (SQLite handles encoding natively)
 * - Removed `id: :integer` — SQLite uses INTEGER PRIMARY KEY which auto-increments
 * - UUID columns stored as TEXT
 * - Removed `precision: nil` from datetime columns (SQLite doesn't support sub-second precision the same way)
 *
 * Authie sessions tables are excluded — Clerk will replace the auth system (Phase 9).
 */
export const MAIN_DB_DDL = `
-- Users
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    email_address TEXT,
    password_digest TEXT,
    time_zone TEXT,
    email_verification_token TEXT,
    email_verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    password_reset_token TEXT,
    password_reset_token_valid_until TEXT,
    admin INTEGER NOT NULL DEFAULT 0,
    oidc_uid TEXT,
    oidc_issuer TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email_address);

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    name TEXT,
    permalink TEXT,
    time_zone TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    ip_pool_id INTEGER,
    owner_id INTEGER,
    deleted_at TEXT,
    suspended_at TEXT,
    suspension_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_orgs_uuid ON organizations(uuid);
CREATE INDEX IF NOT EXISTS idx_orgs_permalink ON organizations(permalink);

-- Organization-User join
CREATE TABLE IF NOT EXISTS organization_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER,
    user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    admin INTEGER NOT NULL DEFAULT 0,
    all_servers INTEGER NOT NULL DEFAULT 1,
    user_type TEXT
);

-- Servers
CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER,
    uuid TEXT NOT NULL,
    name TEXT,
    mode TEXT,
    ip_pool_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    permalink TEXT,
    send_limit INTEGER,
    deleted_at TEXT,
    message_retention_days INTEGER,
    raw_message_retention_days INTEGER,
    raw_message_retention_size INTEGER,
    allow_sender INTEGER NOT NULL DEFAULT 0,
    token TEXT,
    send_limit_approaching_at TEXT,
    send_limit_approaching_notified_at TEXT,
    send_limit_exceeded_at TEXT,
    send_limit_exceeded_notified_at TEXT,
    spam_threshold REAL,
    spam_failure_threshold REAL,
    postmaster_address TEXT,
    suspended_at TEXT,
    outbound_spam_threshold REAL,
    domains_not_to_click_track TEXT,
    suspension_reason TEXT,
    log_smtp_data INTEGER NOT NULL DEFAULT 0,
    privacy_mode INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_servers_uuid ON servers(uuid);
CREATE INDEX IF NOT EXISTS idx_servers_permalink ON servers(permalink);
CREATE INDEX IF NOT EXISTS idx_servers_token ON servers(token);
CREATE INDEX IF NOT EXISTS idx_servers_org ON servers(organization_id);

-- Credentials (API keys)
CREATE TABLE IF NOT EXISTS credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER,
    key TEXT,
    type TEXT,
    name TEXT,
    options TEXT,
    last_used_at TEXT,
    created_at TEXT,
    updated_at TEXT,
    hold INTEGER NOT NULL DEFAULT 0,
    uuid TEXT
);
CREATE INDEX IF NOT EXISTS idx_credentials_key ON credentials(key);
CREATE INDEX IF NOT EXISTS idx_credentials_server ON credentials(server_id);

-- Domains
CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER,
    uuid TEXT NOT NULL,
    name TEXT,
    verification_token TEXT,
    verification_method TEXT,
    verified_at TEXT,
    dkim_private_key TEXT,
    created_at TEXT,
    updated_at TEXT,
    dns_checked_at TEXT,
    spf_status TEXT,
    spf_error TEXT,
    dkim_status TEXT,
    dkim_error TEXT,
    mx_status TEXT,
    mx_error TEXT,
    return_path_status TEXT,
    return_path_error TEXT,
    outgoing INTEGER NOT NULL DEFAULT 1,
    incoming INTEGER NOT NULL DEFAULT 1,
    owner_type TEXT,
    owner_id INTEGER,
    dkim_identifier_string TEXT,
    use_for_any INTEGER
);
CREATE INDEX IF NOT EXISTS idx_domains_uuid ON domains(uuid);
CREATE INDEX IF NOT EXISTS idx_domains_server ON domains(server_id);

-- Routes
CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT,
    server_id INTEGER,
    domain_id INTEGER,
    endpoint_id INTEGER,
    endpoint_type TEXT,
    name TEXT,
    spam_mode TEXT,
    created_at TEXT,
    updated_at TEXT,
    token TEXT,
    mode TEXT
);
CREATE INDEX IF NOT EXISTS idx_routes_token ON routes(token);

-- HTTP Endpoints
CREATE TABLE IF NOT EXISTS http_endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER,
    uuid TEXT,
    name TEXT,
    url TEXT,
    encoding TEXT,
    format TEXT,
    strip_replies INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    disabled_until TEXT,
    last_used_at TEXT,
    created_at TEXT,
    updated_at TEXT,
    include_attachments INTEGER NOT NULL DEFAULT 1,
    timeout INTEGER
);

-- SMTP Endpoints
CREATE TABLE IF NOT EXISTS smtp_endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER,
    uuid TEXT,
    name TEXT,
    hostname TEXT,
    ssl_mode TEXT,
    port INTEGER,
    error TEXT,
    disabled_until TEXT,
    last_used_at TEXT,
    created_at TEXT,
    updated_at TEXT
);

-- Address Endpoints
CREATE TABLE IF NOT EXISTS address_endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER,
    uuid TEXT,
    address TEXT,
    last_used_at TEXT,
    created_at TEXT,
    updated_at TEXT
);

-- Additional Route Endpoints (join table)
CREATE TABLE IF NOT EXISTS additional_route_endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER,
    endpoint_type TEXT,
    endpoint_id INTEGER,
    created_at TEXT,
    updated_at TEXT
);

-- IP Pools
CREATE TABLE IF NOT EXISTS ip_pools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    uuid TEXT,
    created_at TEXT,
    updated_at TEXT,
    default_pool INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ip_pools_uuid ON ip_pools(uuid);

-- IP Pool Rules
CREATE TABLE IF NOT EXISTS ip_pool_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT,
    owner_type TEXT,
    owner_id INTEGER,
    ip_pool_id INTEGER,
    from_text TEXT,
    to_text TEXT,
    created_at TEXT,
    updated_at TEXT
);

-- IP Addresses
CREATE TABLE IF NOT EXISTS ip_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_pool_id INTEGER,
    ipv4 TEXT,
    ipv6 TEXT,
    created_at TEXT,
    updated_at TEXT,
    hostname TEXT,
    priority INTEGER
);

-- Organization IP Pool join
CREATE TABLE IF NOT EXISTS organization_ip_pools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER,
    ip_pool_id INTEGER,
    created_at TEXT,
    updated_at TEXT
);

-- Queued Messages (main job queue)
CREATE TABLE IF NOT EXISTS queued_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER,
    message_id INTEGER,
    domain TEXT,
    domain_id INTEGER,
    locked_by TEXT,
    locked_at TEXT,
    retry_after TEXT,
    created_at TEXT,
    updated_at TEXT,
    ip_address_id INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 18,
    route_id INTEGER,
    manual INTEGER NOT NULL DEFAULT 0,
    batch_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_queued_messages_domain ON queued_messages(domain);
CREATE INDEX IF NOT EXISTS idx_queued_messages_server ON queued_messages(server_id);
CREATE INDEX IF NOT EXISTS idx_queued_messages_message ON queued_messages(message_id);

-- Webhooks
CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER,
    uuid TEXT,
    name TEXT,
    url TEXT,
    last_used_at TEXT,
    all_events INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    sign INTEGER NOT NULL DEFAULT 1,
    created_at TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_webhooks_server ON webhooks(server_id);

-- Webhook Events (event types per webhook)
CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_id INTEGER,
    event TEXT,
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook ON webhook_events(webhook_id);

-- Webhook Requests (delivery log)
CREATE TABLE IF NOT EXISTS webhook_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER,
    webhook_id INTEGER,
    url TEXT,
    event TEXT,
    uuid TEXT,
    payload TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    retry_after TEXT,
    error TEXT,
    created_at TEXT,
    locked_by TEXT,
    locked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_webhook_requests_locked ON webhook_requests(locked_by);

-- Worker Roles (distributed locking)
CREATE TABLE IF NOT EXISTS worker_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL UNIQUE,
    worker TEXT,
    acquired_at TEXT
);

-- Scheduled Tasks
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    next_run_after TEXT
);

-- Track Certificates (for SSL on tracking domains)
CREATE TABLE IF NOT EXISTS track_certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT,
    certificate TEXT,
    intermediaries TEXT,
    key TEXT,
    expires_at TEXT,
    renew_after TEXT,
    verification_path TEXT,
    verification_string TEXT,
    created_at TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_track_certificates_domain ON track_certificates(domain);

-- Track Domains
CREATE TABLE IF NOT EXISTS track_domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT,
    server_id INTEGER,
    domain_id INTEGER,
    name TEXT,
    dns_checked_at TEXT,
    dns_status TEXT,
    dns_error TEXT,
    created_at TEXT,
    updated_at TEXT,
    ssl_enabled INTEGER NOT NULL DEFAULT 1,
    track_clicks INTEGER NOT NULL DEFAULT 1,
    track_loads INTEGER NOT NULL DEFAULT 1,
    excluded_click_domains TEXT
);

-- User Invites
CREATE TABLE IF NOT EXISTS user_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT,
    email_address TEXT,
    expires_at TEXT,
    created_at TEXT,
    updated_at TEXT
);

-- Statistics
CREATE TABLE IF NOT EXISTS statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_messages INTEGER NOT NULL DEFAULT 0,
    total_outgoing INTEGER NOT NULL DEFAULT 0,
    total_incoming INTEGER NOT NULL DEFAULT 0
);

-- Schema migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Failed messages (DLQ) — bunqueue-inspired dead letter queue
CREATE TABLE IF NOT EXISTS failed_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queue_message_id INTEGER,
    message_id INTEGER,
    server_id INTEGER,
    reason TEXT NOT NULL,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_failed_messages_server ON failed_messages(server_id);
CREATE INDEX IF NOT EXISTS idx_failed_messages_reason ON failed_messages(reason);
CREATE INDEX IF NOT EXISTS idx_failed_messages_created ON failed_messages(created_at);
`;

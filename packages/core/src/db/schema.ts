/**
 * Main database DDL — PostgreSQL-compatible CREATE TABLE statements.
 *
 * Session tables are excluded: authentication is handled by Clerk.
 */
export const MAIN_DB_DDL = `
-- Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uuid TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    email_address TEXT,
    password_digest TEXT,
    time_zone TEXT,
    email_verification_token TEXT,
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    password_reset_token TEXT,
    password_reset_token_valid_until TIMESTAMPTZ,
    admin INTEGER NOT NULL DEFAULT 0,
    oidc_uid TEXT,
    oidc_issuer TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email_address);

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    uuid TEXT NOT NULL,
    name TEXT,
    permalink TEXT,
    time_zone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_pool_id INTEGER,
    owner_id INTEGER,
    deleted_at TIMESTAMPTZ,
    suspended_at TIMESTAMPTZ,
    suspension_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_orgs_uuid ON organizations(uuid);
CREATE INDEX IF NOT EXISTS idx_orgs_permalink ON organizations(permalink);

-- Organization-User join
CREATE TABLE IF NOT EXISTS organization_users (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER,
    user_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    admin INTEGER NOT NULL DEFAULT 0,
    all_servers INTEGER NOT NULL DEFAULT 1,
    user_type TEXT
);

-- Servers
CREATE TABLE IF NOT EXISTS servers (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER,
    uuid TEXT NOT NULL,
    name TEXT,
    mode TEXT,
    ip_pool_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    permalink TEXT,
    send_limit INTEGER,
    deleted_at TIMESTAMPTZ,
    message_retention_days INTEGER,
    raw_message_retention_days INTEGER,
    raw_message_retention_size INTEGER,
    allow_sender INTEGER NOT NULL DEFAULT 0,
    token TEXT,
    send_limit_approaching_at TIMESTAMPTZ,
    send_limit_approaching_notified_at TIMESTAMPTZ,
    send_limit_exceeded_at TIMESTAMPTZ,
    send_limit_exceeded_notified_at TIMESTAMPTZ,
    spam_threshold REAL,
    spam_failure_threshold REAL,
    postmaster_address TEXT,
    suspended_at TIMESTAMPTZ,
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
    id SERIAL PRIMARY KEY,
    server_id INTEGER,
    key TEXT,
    type TEXT,
    name TEXT,
    options TEXT,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    hold INTEGER NOT NULL DEFAULT 0,
    uuid TEXT
);
CREATE INDEX IF NOT EXISTS idx_credentials_key ON credentials(key);
CREATE INDEX IF NOT EXISTS idx_credentials_server ON credentials(server_id);

-- Domains
CREATE TABLE IF NOT EXISTS domains (
    id SERIAL PRIMARY KEY,
    server_id INTEGER,
    uuid TEXT NOT NULL,
    name TEXT,
    verification_token TEXT,
    verification_method TEXT,
    verified_at TIMESTAMPTZ,
    dkim_private_key TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    dns_checked_at TIMESTAMPTZ,
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
    id SERIAL PRIMARY KEY,
    uuid TEXT,
    server_id INTEGER,
    domain_id INTEGER,
    endpoint_id INTEGER,
    endpoint_type TEXT,
    name TEXT,
    spam_mode TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    token TEXT,
    mode TEXT
);
CREATE INDEX IF NOT EXISTS idx_routes_token ON routes(token);

-- HTTP Endpoints
CREATE TABLE IF NOT EXISTS http_endpoints (
    id SERIAL PRIMARY KEY,
    server_id INTEGER,
    uuid TEXT,
    name TEXT,
    url TEXT,
    encoding TEXT,
    format TEXT,
    strip_replies INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    disabled_until TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    include_attachments INTEGER NOT NULL DEFAULT 1,
    timeout INTEGER
);

-- SMTP Endpoints
CREATE TABLE IF NOT EXISTS smtp_endpoints (
    id SERIAL PRIMARY KEY,
    server_id INTEGER,
    uuid TEXT,
    name TEXT,
    hostname TEXT,
    ssl_mode TEXT,
    port INTEGER,
    error TEXT,
    disabled_until TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Address Endpoints
CREATE TABLE IF NOT EXISTS address_endpoints (
    id SERIAL PRIMARY KEY,
    server_id INTEGER,
    uuid TEXT,
    address TEXT,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Additional Route Endpoints (join table)
CREATE TABLE IF NOT EXISTS additional_route_endpoints (
    id SERIAL PRIMARY KEY,
    route_id INTEGER,
    endpoint_type TEXT,
    endpoint_id INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- IP Pools
CREATE TABLE IF NOT EXISTS ip_pools (
    id SERIAL PRIMARY KEY,
    name TEXT,
    uuid TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    default_pool INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ip_pools_uuid ON ip_pools(uuid);

-- IP Pool Rules
CREATE TABLE IF NOT EXISTS ip_pool_rules (
    id SERIAL PRIMARY KEY,
    uuid TEXT,
    owner_type TEXT,
    owner_id INTEGER,
    ip_pool_id INTEGER,
    from_text TEXT,
    to_text TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- IP Addresses
CREATE TABLE IF NOT EXISTS ip_addresses (
    id SERIAL PRIMARY KEY,
    ip_pool_id INTEGER,
    ipv4 TEXT,
    ipv6 TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    hostname TEXT,
    priority INTEGER
);

-- Organization IP Pool join
CREATE TABLE IF NOT EXISTS organization_ip_pools (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER,
    ip_pool_id INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Queued Messages (main job queue)
CREATE TABLE IF NOT EXISTS queued_messages (
    id SERIAL PRIMARY KEY,
    server_id INTEGER,
    message_id INTEGER,
    domain TEXT,
    domain_id INTEGER,
    locked_by TEXT,
    locked_at TIMESTAMPTZ,
    retry_after TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
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
    id SERIAL PRIMARY KEY,
    server_id INTEGER,
    uuid TEXT,
    name TEXT,
    url TEXT,
    last_used_at TIMESTAMPTZ,
    all_events INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    sign INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_webhooks_server ON webhooks(server_id);

-- Webhook Events (event types per webhook)
CREATE TABLE IF NOT EXISTS webhook_events (
    id SERIAL PRIMARY KEY,
    webhook_id INTEGER,
    event TEXT,
    created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook ON webhook_events(webhook_id);

-- Webhook Requests (delivery log)
CREATE TABLE IF NOT EXISTS webhook_requests (
    id SERIAL PRIMARY KEY,
    server_id INTEGER,
    webhook_id INTEGER,
    url TEXT,
    event TEXT,
    uuid TEXT,
    payload TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    retry_after TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ,
    locked_by TEXT,
    locked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_webhook_requests_locked ON webhook_requests(locked_by);

-- Worker Roles (distributed locking)
CREATE TABLE IF NOT EXISTS worker_roles (
    id SERIAL PRIMARY KEY,
    role TEXT NOT NULL UNIQUE,
    worker TEXT,
    acquired_at TIMESTAMPTZ
);

-- Scheduled Tasks
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    next_run_after TIMESTAMPTZ
);

-- Track Certificates (for SSL on tracking domains)
CREATE TABLE IF NOT EXISTS track_certificates (
    id SERIAL PRIMARY KEY,
    domain TEXT,
    certificate TEXT,
    intermediaries TEXT,
    key TEXT,
    expires_at TIMESTAMPTZ,
    renew_after TIMESTAMPTZ,
    verification_path TEXT,
    verification_string TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_track_certificates_domain ON track_certificates(domain);

-- Track Domains
CREATE TABLE IF NOT EXISTS track_domains (
    id SERIAL PRIMARY KEY,
    uuid TEXT,
    server_id INTEGER,
    domain_id INTEGER,
    name TEXT,
    dns_checked_at TIMESTAMPTZ,
    dns_status TEXT,
    dns_error TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    ssl_enabled INTEGER NOT NULL DEFAULT 1,
    track_clicks INTEGER NOT NULL DEFAULT 1,
    track_loads INTEGER NOT NULL DEFAULT 1,
    excluded_click_domains TEXT
);

-- User Invites
CREATE TABLE IF NOT EXISTS user_invites (
    id SERIAL PRIMARY KEY,
    uuid TEXT,
    email_address TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Statistics
CREATE TABLE IF NOT EXISTS statistics (
    id SERIAL PRIMARY KEY,
    total_messages INTEGER NOT NULL DEFAULT 0,
    total_outgoing INTEGER NOT NULL DEFAULT 0,
    total_incoming INTEGER NOT NULL DEFAULT 0
);

-- Schema migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Failed messages (DLQ) — dead letter queue
CREATE TABLE IF NOT EXISTS failed_messages (
    id SERIAL PRIMARY KEY,
    queue_message_id INTEGER,
    message_id INTEGER,
    server_id INTEGER,
    reason TEXT NOT NULL,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_failed_messages_server ON failed_messages(server_id);
CREATE INDEX IF NOT EXISTS idx_failed_messages_reason ON failed_messages(reason);
CREATE INDEX IF NOT EXISTS idx_failed_messages_created ON failed_messages(created_at);

-- ─── Queue wake-up ──────────────────────────────────────────────────────
-- Signals workers the moment a message is enqueued, so they do not wait out
-- an idle poll interval.
--
-- A trigger rather than a pg_notify() call at each insert site: messages are
-- enqueued by the API, the SMTP server and the worker's own retry path, and
-- a producer added later would otherwise silently fall back to poll latency.
-- Attaching it to the table means every writer signals by construction.
--
-- The payload is deliberately empty. NOTIFY payloads are capped at 8000
-- bytes and the worker re-queries regardless, so sending the row would add a
-- second source of truth that could disagree with the table.
CREATE OR REPLACE FUNCTION posta_notify_queued_message() RETURNS trigger AS $BODY$
BEGIN
  PERFORM pg_notify('posta_queued_messages', '');
  RETURN NULL;
END;
$BODY$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posta_queued_messages_notify ON queued_messages;

-- AFTER INSERT, statement-level: one notification per statement rather than
-- per row, so a thousand-row batch insert wakes the worker once.
CREATE TRIGGER posta_queued_messages_notify
AFTER INSERT ON queued_messages
FOR EACH STATEMENT
EXECUTE FUNCTION posta_notify_queued_message();
`;

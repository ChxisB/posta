/**
 * MessageDB DDL — SQLite-compatible CREATE TABLE statements.
 *
 * Translated from 20 MySQL migrations at lib/posta/message_db/migrations/.
 * Key differences from MySQL:
 * - INTEGER PRIMARY KEY instead of AUTO_INCREMENT
 * - TEXT instead of VARCHAR (SQLite treats them the same)
 * - REAL instead of DECIMAL(18,6) for timestamps
 * - No ENGINE, CHARSET, COLLATION, or USING BTREE
 */

export const MESSAGE_DB_DDL = `

-- Migration tracking table
CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER NOT NULL PRIMARY KEY
);

-- Messages (core table)
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
    received_with_ssl INTEGER,
    hold_expiry REAL,
    tracked_links INTEGER DEFAULT 0,
    tracked_images INTEGER DEFAULT 0,
    parsed INTEGER DEFAULT 0,
    endpoint_id INTEGER,
    endpoint_type TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);
CREATE INDEX IF NOT EXISTS idx_messages_token ON messages(token);
CREATE INDEX IF NOT EXISTS idx_messages_bounce_for ON messages(bounce_for_id);
CREATE INDEX IF NOT EXISTS idx_messages_held ON messages(held);
CREATE INDEX IF NOT EXISTS idx_messages_scope_status ON messages(scope, spam, status, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_scope_tag ON messages(scope, spam, tag, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_scope_spam ON messages(scope, spam, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_scope_threat_status ON messages(scope, threat, status, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_scope_threat ON messages(scope, threat, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_rcpt_to ON messages(rcpt_to, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_mail_from ON messages(mail_from, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_raw_table ON messages(raw_table);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

-- Deliveries
CREATE TABLE IF NOT EXISTS deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER,
    status TEXT,
    code INTEGER,
    output TEXT,
    details TEXT,
    sent_with_ssl INTEGER NOT NULL DEFAULT 0,
    log_id TEXT,
    timestamp REAL,
    time REAL
);
CREATE INDEX IF NOT EXISTS idx_deliveries_message ON deliveries(message_id);

-- Clicks
CREATE TABLE IF NOT EXISTS clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER,
    link_id INTEGER,
    ip_address TEXT,
    country TEXT,
    city TEXT,
    user_agent TEXT,
    timestamp REAL
);
CREATE INDEX IF NOT EXISTS idx_clicks_message ON clicks(message_id);
CREATE INDEX IF NOT EXISTS idx_clicks_link ON clicks(link_id);

-- Loads (image opens)
CREATE TABLE IF NOT EXISTS loads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER,
    ip_address TEXT,
    country TEXT,
    city TEXT,
    user_agent TEXT,
    timestamp REAL
);
CREATE INDEX IF NOT EXISTS idx_loads_message ON loads(message_id);

-- Links (tracked URLs)
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER,
    token TEXT,
    hash TEXT,
    url TEXT,
    timestamp REAL
);
CREATE INDEX IF NOT EXISTS idx_links_message ON links(message_id);
CREATE INDEX IF NOT EXISTS idx_links_token ON links(token);

-- Spam checks
CREATE TABLE IF NOT EXISTS spam_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER,
    score REAL,
    code TEXT,
    description TEXT
);
CREATE INDEX IF NOT EXISTS idx_spam_checks_message ON spam_checks(message_id);
CREATE INDEX IF NOT EXISTS idx_spam_checks_code ON spam_checks(code);

-- Live stats (per-minute counters for last 60 min)
CREATE TABLE IF NOT EXISTS live_stats (
    type TEXT NOT NULL,
    minute INTEGER NOT NULL,
    count INTEGER,
    timestamp REAL,
    PRIMARY KEY (minute, type)
);

-- Raw message sizes tracking
CREATE TABLE IF NOT EXISTS raw_message_sizes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT,
    size INTEGER
);
CREATE INDEX IF NOT EXISTS idx_raw_sizes_table ON raw_message_sizes(table_name);

-- Statistics (hourly/daily/monthly/yearly)
CREATE TABLE IF NOT EXISTS stats_hourly (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time INTEGER UNIQUE,
    incoming INTEGER DEFAULT 0,
    outgoing INTEGER DEFAULT 0,
    spam INTEGER DEFAULT 0,
    bounces INTEGER DEFAULT 0,
    held INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stats_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time INTEGER UNIQUE,
    incoming INTEGER DEFAULT 0,
    outgoing INTEGER DEFAULT 0,
    spam INTEGER DEFAULT 0,
    bounces INTEGER DEFAULT 0,
    held INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stats_monthly (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time INTEGER UNIQUE,
    incoming INTEGER DEFAULT 0,
    outgoing INTEGER DEFAULT 0,
    spam INTEGER DEFAULT 0,
    bounces INTEGER DEFAULT 0,
    held INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stats_yearly (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time INTEGER UNIQUE,
    incoming INTEGER DEFAULT 0,
    outgoing INTEGER DEFAULT 0,
    spam INTEGER DEFAULT 0,
    bounces INTEGER DEFAULT 0,
    held INTEGER DEFAULT 0
);

-- Suppressions
CREATE TABLE IF NOT EXISTS suppressions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    address TEXT,
    reason TEXT,
    timestamp REAL,
    keep_until REAL
);
CREATE INDEX IF NOT EXISTS idx_suppressions_address ON suppressions(address);
CREATE INDEX IF NOT EXISTS idx_suppressions_keep_until ON suppressions(keep_until);

-- Webhook requests
CREATE TABLE IF NOT EXISTS webhook_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT,
    event TEXT,
    attempt INTEGER,
    timestamp REAL,
    status_code INTEGER,
    body TEXT,
    payload TEXT,
    will_retry INTEGER,
    url TEXT,
    webhook_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_webhook_requests_uuid ON webhook_requests(uuid);
CREATE INDEX IF NOT EXISTS idx_webhook_requests_event ON webhook_requests(event);
CREATE INDEX IF NOT EXISTS idx_webhook_requests_timestamp ON webhook_requests(timestamp);
CREATE INDEX IF NOT EXISTS idx_webhook_requests_webhook ON webhook_requests(webhook_id);

`;

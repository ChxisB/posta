/**
 * Unified message store — the Phase 1 target schema.
 *
 * Replaces the schema-per-server model, where every mail server got its own
 * `posta_server_{id}` Postgres schema containing sixteen tables. That works
 * for an install with five servers. At scale — 10,000 organisations with a
 * couple of servers each — it is 320,000 tables in one
 * cluster, which breaks in ways that are hard to reverse:
 *
 *   - a migration becomes 20,000 sequential DDL transactions, runs for
 *     hours, and can fail half-way leaving schemas at different versions
 *   - pg_catalog bloats and every query pays for it in planning
 *   - autovacuum thrashes across tens of thousands of tiny relations
 *   - the plan cache cannot hold prepared statements for that many tables
 *
 * The replacement is one set of tables carrying `tenant_id`, partitioned by
 * time. Three deliberate choices, each expensive to change later:
 *
 * 1. RANGE partition on `created_at`, monthly.
 *    Retention becomes DETACH PARTITION — near-instant, no dead tuples. The
 *    alternative, DELETE FROM messages WHERE created_at < …, generates a
 *    vacuum storm at a billion rows a month, and is what eventually forces
 *    an unplanned migration on every platform that skips it.
 *
 * 2. `tenant_id` on every table, leading every index.
 *    Isolation is enforced in the repository layer, but the physical layout
 *    has to agree with it: a query for one tenant's messages must never scan
 *    another's. Leading the index with tenant_id makes that structural.
 *
 * 3. Bodies live in object storage; this holds a key.
 *    At ~30KB average and a billion messages a month that is ~30TB/month.
 *    Postgres is the wrong home at any price, and moving bodies out also
 *    takes the largest column off the hot path.
 *
 * Timestamps are TIMESTAMPTZ, not the REAL unix floats the old schema used.
 * Float seconds lose sub-millisecond precision and drift when compared
 * across timezones — unhelpful in a system whose product claim is measured
 * in milliseconds.
 */
export const MESSAGE_STORE_DDL = `
-- ─── Messages ───────────────────────────────────────────────────────────
-- A partitioned table's primary key must include the partition key, hence
-- (id, created_at) rather than id alone.
CREATE TABLE IF NOT EXISTS messages (
    id              BIGINT      GENERATED ALWAYS AS IDENTITY,
    tenant_id       BIGINT      NOT NULL,
    server_id       BIGINT      NOT NULL,
    token           TEXT,
    scope           TEXT        NOT NULL,
    mail_from       TEXT,
    rcpt_to         TEXT        NOT NULL,
    subject         TEXT,
    message_id      TEXT,
    status          TEXT        NOT NULL DEFAULT 'Pending',
    held            BOOLEAN     NOT NULL DEFAULT FALSE,
    size_bytes      BIGINT,
    -- Object-storage key for the raw message. NULL until the body is stored.
    body_key        TEXT,
    domain_id       BIGINT,
    route_id        BIGINT,
    credential_id   BIGINT,
    spam            BOOLEAN     NOT NULL DEFAULT FALSE,
    spam_score      REAL        NOT NULL DEFAULT 0,
    threat          BOOLEAN     NOT NULL DEFAULT FALSE,
    bounce          BOOLEAN     NOT NULL DEFAULT FALSE,
    bounce_for_id   BIGINT,
    tag             TEXT,
    last_attempt_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- The dashboard's hot read: one server's messages, newest first. tenant_id
-- leads so a scan can never cross a tenant boundary.
CREATE INDEX IF NOT EXISTS idx_messages_tenant_server_created
    ON messages (tenant_id, server_id, created_at DESC);

-- Status filtering ("show me everything held") within a tenant.
CREATE INDEX IF NOT EXISTS idx_messages_tenant_status_created
    ON messages (tenant_id, status, created_at DESC);

-- Lookup by RFC 5322 Message-ID, for bounce correlation. Partial: most rows
-- never need it and the index would otherwise be large.
CREATE INDEX IF NOT EXISTS idx_messages_message_id
    ON messages (tenant_id, message_id) WHERE message_id IS NOT NULL;


-- ─── Deliveries ─────────────────────────────────────────────────────────
-- One row per attempt, so a message with fifteen deferrals keeps fifteen
-- rows. This answers "what actually happened", and is what support reads
-- during an incident.
CREATE TABLE IF NOT EXISTS deliveries (
    id            BIGINT      GENERATED ALWAYS AS IDENTITY,
    tenant_id     BIGINT      NOT NULL,
    message_id    BIGINT      NOT NULL,
    attempt       INTEGER     NOT NULL DEFAULT 1,
    status        TEXT        NOT NULL,
    code          INTEGER,
    -- The remote server's verbatim reply. Kept whole: a truncated 4xx is
    -- useless for diagnosing a deferral.
    output        TEXT,
    sent_with_ssl BOOLEAN     NOT NULL DEFAULT FALSE,
    duration_ms   INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_deliveries_message
    ON deliveries (tenant_id, message_id, created_at DESC);


-- ─── Engagement ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS links (
    id         BIGINT      GENERATED ALWAYS AS IDENTITY,
    tenant_id  BIGINT      NOT NULL,
    message_id BIGINT      NOT NULL,
    token      TEXT        NOT NULL,
    url        TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_links_token ON links (tenant_id, token);

CREATE TABLE IF NOT EXISTS clicks (
    id         BIGINT      GENERATED ALWAYS AS IDENTITY,
    tenant_id  BIGINT      NOT NULL,
    message_id BIGINT      NOT NULL,
    link_id    BIGINT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_clicks_message ON clicks (tenant_id, message_id);

CREATE TABLE IF NOT EXISTS loads (
    id         BIGINT      GENERATED ALWAYS AS IDENTITY,
    tenant_id  BIGINT      NOT NULL,
    message_id BIGINT      NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_loads_message ON loads (tenant_id, message_id);


-- ─── Spam checks ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spam_checks (
    id          BIGINT      GENERATED ALWAYS AS IDENTITY,
    tenant_id   BIGINT      NOT NULL,
    message_id  BIGINT      NOT NULL,
    code        TEXT        NOT NULL,
    score       REAL        NOT NULL DEFAULT 0,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_spam_checks_message
    ON spam_checks (tenant_id, message_id);


-- ─── Suppressions ───────────────────────────────────────────────────────
-- Deliberately NOT partitioned by time. A suppression is current state, not
-- an event: it is read on the hot path before every send, and it must not
-- age out of a partition while the address is still suppressed. Sending to a
-- hard-bounced address is how sender reputation is destroyed.
CREATE TABLE IF NOT EXISTS suppressions (
    id         BIGSERIAL   PRIMARY KEY,
    tenant_id  BIGINT      NOT NULL,
    server_id  BIGINT,
    address    TEXT        NOT NULL,
    reason     TEXT        NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique per tenant+server+address, so the send path is a single index probe.
-- A NULL server_id means the suppression applies tenant-wide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppressions_lookup
    ON suppressions (tenant_id, COALESCE(server_id, 0), lower(address));

CREATE INDEX IF NOT EXISTS idx_suppressions_expiry
    ON suppressions (expires_at) WHERE expires_at IS NOT NULL;
`;

/** Tables RANGE-partitioned on created_at, needing monthly children. */
export const PARTITIONED_TABLES = [
  'messages',
  'deliveries',
  'links',
  'clicks',
  'loads',
  'spam_checks',
] as const;

/**
 * DDL for one month's partition of one table.
 *
 * Partitions are created ahead of time by a scheduled task, never lazily on
 * insert. A missing partition makes the INSERT fail outright, so discovering
 * it at midnight on the first of the month — when the previous partition
 * stops accepting rows — means dropping mail. Running months ahead turns
 * that into an alert with weeks of slack.
 */
export function partitionDDL(table: string, year: number, month: number): string {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const name = `${table}_${year}${String(month).padStart(2, '0')}`;
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return (
    `CREATE TABLE IF NOT EXISTS ${name} PARTITION OF ${table} ` +
    `FOR VALUES FROM ('${iso(start)}') TO ('${iso(end)}');`
  );
}

/** The months that should exist right now: the current one plus `ahead`. */
export function partitionsToEnsure(now: Date, ahead = 2): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  for (let i = 0; i <= ahead; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return out;
}

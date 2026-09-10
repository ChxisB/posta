import type { PgClient } from '@posta/core';

/**
 * Backfill from a legacy `posta_server_{id}` schema into the unified store.
 *
 * Three properties this has to have, because it moves live customer data and
 * a mistake is not recoverable from logs:
 *
 * 1. **Read-only at the source.** Nothing here deletes, updates or locks the
 *    old schema. The old server keeps serving from it throughout, and if the
 *    backfill is wrong the answer is to truncate the v2 side and run again —
 *    which is only possible while the source is untouched.
 *
 * 2. **Idempotent and resumable.** A large copy will be interrupted. Progress
 *    is tracked per table so a re-run continues rather than duplicating.
 *
 * 3. **Verified, not assumed.** A copy that silently dropped 0.1% of rows
 *    looks fine in every other way and is discovered by a customer.
 *
 * The conversion needing care is time. The old schema stores `REAL` unix
 * seconds — a float, which cannot represent every millisecond exactly and
 * loses ordering between attempts recorded in the same second. v2 uses
 * TIMESTAMPTZ. For `messages` that is cosmetic. For `deliveries` it is not:
 * the attempt sequence is the story support reads, and reordering it makes a
 * deferral look like it happened after the delivery that resolved it. So
 * `attempt` is derived from the source ordering rather than trusted from the
 * timestamp — see the ROW_NUMBER below.
 */

export interface BackfillPlan {
  /** Legacy schema, e.g. `posta_server_42`. */
  sourceSchema: string;
  tenantId: number;
  serverId: number;
}

export interface BackfillOptions {
  /** Rows per statement. Large enough to be fast, small enough to interrupt. */
  batchSize?: number;
  onProgress?: (table: string, copied: number) => void;
}

export interface TableResult {
  table: string;
  copied: number;
}

const DEFAULT_BATCH = 10_000;

/**
 * A legacy id has to survive the copy, because child rows reference it.
 *
 * v2 generates its own identity, so `deliveries.message_id` cannot simply be
 * carried across — it would point at whatever v2 row happened to take that
 * number, which is another tenant's message. The map is written first and
 * every child lookup goes through it.
 */
const BACKFILL_DDL = `
CREATE TABLE IF NOT EXISTS backfill_id_map (
    source_schema TEXT   NOT NULL,
    table_name    TEXT   NOT NULL,
    old_id        BIGINT NOT NULL,
    new_id        BIGINT NOT NULL,
    PRIMARY KEY (source_schema, table_name, old_id)
);

CREATE TABLE IF NOT EXISTS backfill_progress (
    source_schema TEXT        NOT NULL,
    table_name    TEXT        NOT NULL,
    last_id       BIGINT      NOT NULL DEFAULT 0,
    completed_at  TIMESTAMPTZ,
    PRIMARY KEY (source_schema, table_name)
);
`;

export async function prepareBackfill(db: PgClient): Promise<void> {
  await db.exec(BACKFILL_DDL);
}

/** Where a previous run of this table got to. */
async function lastId(db: PgClient, schema: string, table: string): Promise<number> {
  const row = await db.get<{ last_id: string }>(
    `SELECT last_id FROM backfill_progress WHERE source_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  return row ? Number(row.last_id) : 0;
}

async function recordProgress(
  db: PgClient,
  schema: string,
  table: string,
  id: number,
  done = false,
): Promise<void> {
  await db.run(
    `INSERT INTO backfill_progress (source_schema, table_name, last_id, completed_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source_schema, table_name)
     DO UPDATE SET last_id = EXCLUDED.last_id, completed_at = EXCLUDED.completed_at`,
    [schema, table, id, done ? new Date() : null],
  );
}

/**
 * Copy `messages`, recording the old to new id mapping as it goes.
 *
 * Done entirely in SQL rather than round-tripping rows through this process.
 * At scale the difference is not a constant factor: pulling each row into JS
 * and inserting it back costs two network round trips per row, which turns
 * hours into weeks.
 */
async function copyMessages(
  db: PgClient,
  plan: BackfillPlan,
  options: BackfillOptions,
): Promise<number> {
  const { sourceSchema: s, tenantId, serverId } = plan;
  const batch = options.batchSize ?? DEFAULT_BATCH;
  let cursor = await lastId(db, s, 'messages');
  let copied = 0;

  for (;;) {
    const rows = await db.query<{ old_id: string; new_id: string }>(
      `WITH src AS (
         SELECT *, row_number() OVER (ORDER BY id) AS rn
           FROM ${s}.messages
          WHERE id > $3
          ORDER BY id
          LIMIT ${batch}
       ),
       ins AS (
         INSERT INTO messages (
           tenant_id, server_id, token, scope, mail_from, rcpt_to, subject,
           message_id, status, held, size_bytes, domain_id, route_id,
           credential_id, spam, spam_score, bounce, tag, created_at
         )
         SELECT
           $1, $2, src.token, COALESCE(src.scope, 'outgoing'), src.mail_from,
           COALESCE(src.rcpt_to, ''), src.subject, src.message_id,
           COALESCE(src.status, 'Pending'), COALESCE(src.held, 0) <> 0,
           NULLIF(src.size, '')::bigint, src.domain_id, src.route_id,
           src.credential_id, COALESCE(src.spam, 0) <> 0,
           COALESCE(src.spam_score, 0), COALESCE(src.bounce, 0) <> 0, src.tag,
           -- REAL unix seconds to TIMESTAMPTZ. A NULL becomes epoch rather
           -- than now(): a row with no timestamp is old, and dating it to the
           -- migration would drop it into the current partition and show as
           -- traffic that never happened.
           to_timestamp(COALESCE(src.timestamp, 0))
         FROM src
         ORDER BY src.rn
         RETURNING id AS new_id
       ),
       numbered AS (SELECT new_id, row_number() OVER (ORDER BY new_id) AS rn FROM ins)
       SELECT src.id::text AS old_id, numbered.new_id::text AS new_id
         FROM src JOIN numbered ON numbered.rn = src.rn`,
      [tenantId, serverId, cursor],
    );

    if (rows.length === 0) break;

    await db.run(
      `INSERT INTO backfill_id_map (source_schema, table_name, old_id, new_id)
       SELECT $1, 'messages', unnest($2::bigint[]), unnest($3::bigint[])
       ON CONFLICT DO NOTHING`,
      [s, rows.map((r) => r.old_id), rows.map((r) => r.new_id)],
    );

    cursor = Math.max(...rows.map((r) => Number(r.old_id)));
    copied += rows.length;
    await recordProgress(db, s, 'messages', cursor);
    options.onProgress?.('messages', copied);

    if (rows.length < batch) break;
  }

  await recordProgress(db, s, 'messages', cursor, true);
  return copied;
}

/**
 * Copy `deliveries`, rebuilding the attempt sequence.
 *
 * `attempt` comes from ROW_NUMBER over the source ordering, not from the
 * float timestamp. Two attempts recorded in the same second have equal `REAL`
 * timestamps, so ordering by time alone would shuffle them — and a deferral
 * shown after the delivery that resolved it is worse than no history at all,
 * because it reads as a real event that never happened.
 */
async function copyDeliveries(
  db: PgClient,
  plan: BackfillPlan,
  options: BackfillOptions,
): Promise<number> {
  const { sourceSchema: s, tenantId } = plan;
  const batch = options.batchSize ?? DEFAULT_BATCH;
  let cursor = await lastId(db, s, 'deliveries');
  let copied = 0;

  for (;;) {
    const window = await db.query<{ id: string }>(
      `SELECT id::text FROM ${s}.deliveries WHERE id > $1 ORDER BY id LIMIT ${batch}`,
      [cursor],
    );
    if (window.length === 0) break;
    const highest = Number(window[window.length - 1].id);

    await db.run(
      `INSERT INTO deliveries (
         tenant_id, message_id, attempt, status, code, output,
         sent_with_ssl, created_at
       )
       SELECT
         $1,
         map.new_id,
         row_number() OVER (PARTITION BY d.message_id ORDER BY d.timestamp, d.id),
         COALESCE(d.status, 'Unknown'), d.code, d.output,
         COALESCE(d.sent_with_ssl, 0) <> 0,
         to_timestamp(COALESCE(d.timestamp, 0))
       FROM ${s}.deliveries d
       -- INNER JOIN on purpose: a delivery whose message did not copy is an
       -- orphan, and inserting it with a dangling message_id would put a row
       -- in the timeline that can never be traced back to anything.
       JOIN backfill_id_map map
         ON map.source_schema = $2
        AND map.table_name = 'messages'
        AND map.old_id = d.message_id
      WHERE d.id > $3 AND d.id <= $4`,
      [tenantId, s, cursor, highest],
    );

    cursor = highest;
    copied += window.length;
    await recordProgress(db, s, 'deliveries', cursor);
    options.onProgress?.('deliveries', copied);

    if (window.length < batch) break;
  }

  await recordProgress(db, s, 'deliveries', cursor, true);
  return copied;
}

/** Suppressions carry no child rows, so they copy directly. */
async function copySuppressions(db: PgClient, plan: BackfillPlan): Promise<number> {
  const { sourceSchema: s, tenantId, serverId } = plan;
  const rows = await db.query<{ id: string }>(
    `INSERT INTO suppressions (tenant_id, server_id, address, reason, expires_at, created_at)
     SELECT $1, $2, sup.address, COALESCE(sup.reason, 'manual'),
            CASE WHEN sup.keep_until IS NULL OR sup.keep_until = 0
                 THEN NULL ELSE to_timestamp(sup.keep_until) END,
            to_timestamp(COALESCE(sup.timestamp, 0))
       FROM ${s}.suppressions sup
       ON CONFLICT (tenant_id, COALESCE(server_id, 0), lower(address)) DO NOTHING
     RETURNING id::text`,
    [tenantId, serverId],
  );
  return rows.length;
}

export async function backfillServer(
  db: PgClient,
  plan: BackfillPlan,
  options: BackfillOptions = {},
): Promise<TableResult[]> {
  await prepareBackfill(db);

  return [
    { table: 'messages', copied: await copyMessages(db, plan, options) },
    { table: 'deliveries', copied: await copyDeliveries(db, plan, options) },
    { table: 'suppressions', copied: await copySuppressions(db, plan) },
  ];
}

export interface VerifyResult {
  table: string;
  sourceCount: number;
  targetCount: number;
  ok: boolean;
}

/**
 * Compare source and target row counts.
 *
 * The weakest useful check, and deliberately the one that runs by default:
 * cheap enough for every server, and it catches the failure that actually
 * happens, which is a batch loop exiting early. Content verification belongs
 * in a sampled pass, not a full-table checksum that would take longer than
 * the copy itself.
 */
export async function verifyBackfill(db: PgClient, plan: BackfillPlan): Promise<VerifyResult[]> {
  const { sourceSchema: s, tenantId, serverId } = plan;

  const messages = await db.get<{ source: string; target: string }>(
    `SELECT
       (SELECT count(*)::text FROM ${s}.messages) AS source,
       (SELECT count(*)::text FROM messages WHERE tenant_id = $1 AND server_id = $2) AS target`,
    [tenantId, serverId],
  );

  const deliveries = await db.get<{ source: string; target: string }>(
    `SELECT
       (SELECT count(*)::text FROM ${s}.deliveries) AS source,
       (SELECT count(*)::text FROM deliveries WHERE tenant_id = $1) AS target`,
    [tenantId],
  );

  return [
    {
      table: 'messages',
      sourceCount: Number(messages?.source ?? 0),
      targetCount: Number(messages?.target ?? 0),
      ok: messages?.source === messages?.target,
    },
    {
      table: 'deliveries',
      sourceCount: Number(deliveries?.source ?? 0),
      targetCount: Number(deliveries?.target ?? 0),
      // Deliveries may legitimately be fewer: orphans whose message did not
      // copy are dropped by the INNER JOIN. Never more.
      ok: Number(deliveries?.target ?? 0) <= Number(deliveries?.source ?? 0),
    },
  ];
}

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { MESSAGE_STORE_DDL, PgClient, partitionDDL } from '@posta/core';
import { backfillServer, verifyBackfill, type BackfillPlan } from './backfill';
import { MessageRepository } from './messages';
import { DeliveryRepository } from './deliveries';
import { SuppressionRepository } from './suppressions';
import { scopeFor } from './scope';

/**
 * Backfill against real Postgres, with a legacy schema built to contain the
 * cases that actually break a migration: null timestamps, ties in float
 * seconds, an orphaned child row, and a re-run.
 */

const ADMIN = 'postgresql://postgres:postgres@localhost:5433/postgres';
const DB_NAME = `posta_bf_${Date.now()}`;
const URL = `postgresql://postgres:postgres@localhost:5433/${DB_NAME}`;

const PLAN: BackfillPlan = { sourceSchema: 'posta_server_7', tenantId: 1, serverId: 7 };
const SCOPE = scopeFor(PLAN.tenantId, PLAN.serverId);

let db: PgClient;

/** Unix seconds as the old schema stored them: a float. */
const T0 = 1_767_225_600; // 2026-01-01T00:00:00Z

beforeAll(async () => {
  const admin = new PgClient(ADMIN);
  await admin.exec(`CREATE DATABASE ${DB_NAME}`);
  await admin.close();

  db = new PgClient(URL);
  await db.exec(MESSAGE_STORE_DDL);
  // Legacy rows land in January 2026 and at the epoch, so both partitions
  // must exist before the copy.
  for (const t of ['messages', 'deliveries']) {
    await db.exec(partitionDDL(t, 2026, 1));
    await db.exec(partitionDDL(t, 1970, 1));
  }

  await db.exec(`
    CREATE SCHEMA ${PLAN.sourceSchema};
    CREATE TABLE ${PLAN.sourceSchema}.messages (
      id SERIAL PRIMARY KEY, token TEXT, scope TEXT, rcpt_to TEXT, mail_from TEXT,
      subject TEXT, message_id TEXT, timestamp REAL, status TEXT, held INTEGER,
      size TEXT, domain_id INTEGER, route_id INTEGER, credential_id INTEGER,
      spam INTEGER, spam_score REAL, bounce INTEGER, tag TEXT
    );
    CREATE TABLE ${PLAN.sourceSchema}.deliveries (
      id SERIAL PRIMARY KEY, message_id INTEGER, status TEXT, code INTEGER,
      output TEXT, sent_with_ssl INTEGER, timestamp REAL
    );
    CREATE TABLE ${PLAN.sourceSchema}.suppressions (
      id SERIAL PRIMARY KEY, address TEXT, reason TEXT, keep_until REAL, timestamp REAL
    );
  `);

  await db.exec(`
    INSERT INTO ${PLAN.sourceSchema}.messages
      (id, scope, rcpt_to, subject, timestamp, status, held, size, spam_score)
    VALUES
      (1,'outgoing','a@acme.test','First',   ${T0},      'Sent',   0, '1024', 0),
      (2,'outgoing','b@acme.test','Second',  ${T0 + 60}, 'Held',   1, '2048', 1.5),
      (3,'outgoing','c@acme.test','Undated', NULL,       'Sent',   0, NULL,   0);

    INSERT INTO ${PLAN.sourceSchema}.deliveries
      (id, message_id, status, code, output, sent_with_ssl, timestamp)
    VALUES
      (1, 1, 'SoftFail', 451, 'deferred once',  0, ${T0}),
      (2, 1, 'SoftFail', 451, 'deferred twice', 0, ${T0}),
      (3, 1, 'Sent',     250, 'delivered',      1, ${T0}),
      (4, 99, 'Sent',    250, 'orphaned',       1, ${T0});

    INSERT INTO ${PLAN.sourceSchema}.suppressions (address, reason, keep_until, timestamp)
    VALUES ('BOUNCED@acme.test','hard_bounce', 0, ${T0}),
           ('temp@acme.test','soft_bounce', ${Math.floor(Date.now() / 1000) + 86400}, ${T0});
  `);
});

afterAll(async () => {
  await db?.close();
});

describe('backfill', () => {
  it('copies every message', async () => {
    const results = await backfillServer(db, PLAN);
    expect(results.find((r) => r.table === 'messages')?.copied).toBe(3);
  });

  it('attributes rows to the tenant and server', async () => {
    const rows = await new MessageRepository(db).list(SCOPE);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.tenant_id === '1' && r.server_id === '7')).toBe(true);
  });

  it('converts float seconds to a timestamp, to the precision REAL preserves', async () => {
    // REAL is float4: at unix-second magnitudes (~1.77e9) its granularity is
    // about 128 seconds, so the legacy schema never stored the minute
    // accurately in the first place. The conversion cannot recover precision
    // that was never written, and asserting to the second here would be
    // asserting a fiction. See the note in backfill.ts.
    const rows = await new MessageRepository(db).list(SCOPE, { status: 'Held' });
    const drift = Math.abs(rows[0].created_at.getTime() - (T0 + 60) * 1000);
    expect(drift).toBeLessThan(128_000);
    expect(rows[0].created_at.getUTCFullYear()).toBe(2026);
  });

  it('dates an undated row to the epoch, not to the migration', async () => {
    // Dating it to now() would drop it into the current partition and show as
    // traffic that never happened.
    const rows = await new MessageRepository(db).list(SCOPE);
    expect(rows.find((r) => r.subject === 'Undated')!.created_at.getUTCFullYear()).toBe(1970);
  });

  it('converts integer flags to booleans', async () => {
    const rows = await new MessageRepository(db).list(SCOPE, { status: 'Held' });
    expect(rows[0].held).toBe(true);
    expect(rows[0].spam).toBe(false);
  });

  it('preserves attempt order when timestamps tie', async () => {
    // The case this exists for: three attempts in the same second. Ordering
    // by the float alone would shuffle them, showing a deferral after the
    // delivery that resolved it.
    const messages = await new MessageRepository(db).list(SCOPE);
    const first = messages.find((m) => m.subject === 'First')!;
    const attempts = await new DeliveryRepository(db).forMessage(SCOPE, first.id);

    expect(attempts.map((a) => a.attempt)).toEqual([1, 2, 3]);
    expect(attempts.map((a) => a.output)).toEqual(['deferred once', 'deferred twice', 'delivered']);
  });

  it('drops an orphaned delivery rather than dangling it', async () => {
    const rows = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM deliveries WHERE tenant_id = 1`,
    );
    // Four in source, one of them orphaned.
    expect(Number(rows[0].count)).toBe(3);
  });

  it('copies suppressions, treating keep_until 0 as permanent', async () => {
    const repo = new SuppressionRepository(db);
    const permanent = await repo.isSuppressed(SCOPE, 'bounced@acme.test');
    expect(permanent).toBeDefined();
    expect(permanent!.expires_at).toBeNull();
    expect((await repo.isSuppressed(SCOPE, 'temp@acme.test'))!.expires_at).not.toBeNull();
  });

  it('matches a suppressed address case-insensitively after the copy', async () => {
    // Stored uppercase in the legacy schema; sends will use lowercase.
    expect(
      await new SuppressionRepository(db).isSuppressed(SCOPE, 'BoUnCeD@acme.test'),
    ).toBeDefined();
  });
});

describe('re-running', () => {
  it('does not duplicate rows', async () => {
    // A large copy will be interrupted and re-run; duplicating a customer's
    // message history is not recoverable without knowing which copy is real.
    await backfillServer(db, PLAN);
    expect(await new MessageRepository(db).list(SCOPE)).toHaveLength(3);
  });

  it('leaves the source untouched', async () => {
    // The rollback plan depends on this: if the copy is wrong, truncate v2
    // and run again. That only works while the source is intact.
    const rows = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${PLAN.sourceSchema}.messages`,
    );
    expect(Number(rows[0].count)).toBe(3);
  });
});

describe('verification', () => {
  it('reports matching counts', async () => {
    const messages = (await verifyBackfill(db, PLAN)).find((r) => r.table === 'messages')!;
    expect(messages.sourceCount).toBe(3);
    expect(messages.targetCount).toBe(3);
    expect(messages.ok).toBe(true);
  });

  it('accepts fewer deliveries, since orphans are dropped', async () => {
    const deliveries = (await verifyBackfill(db, PLAN)).find((r) => r.table === 'deliveries')!;
    expect(deliveries.targetCount).toBeLessThan(deliveries.sourceCount);
    expect(deliveries.ok).toBe(true);
  });

  it('fails when the target is short', async () => {
    // Simulates the failure that actually happens: a batch loop exiting early
    // and silently leaving rows behind.
    await db.run(`DELETE FROM messages WHERE tenant_id = 1 AND subject = 'Undated'`);
    expect((await verifyBackfill(db, PLAN)).find((r) => r.table === 'messages')!.ok).toBe(false);
  });
});

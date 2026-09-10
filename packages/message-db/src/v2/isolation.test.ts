import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { MESSAGE_STORE_DDL, PgClient, partitionDDL, partitionsToEnsure } from '@posta/core';
import { MessageRepository } from './messages';
import { InvalidScopeError, and, scopeFor, where } from './scope';

/**
 * Cross-tenant isolation, against a real Postgres with two tenants' data in
 * the same tables.
 *
 * These tests would have been impossible under the old schema-per-server
 * model and are indispensable under this one. Isolation used to be physical;
 * now it is a predicate, and a predicate can be forgotten. Every case here is
 * written from the attacker's side: given a valid id belonging to someone
 * else, can I read it, change it, or even detect that it exists?
 */

const ADMIN = 'postgresql://postgres:postgres@localhost:5433/postgres';
const DB_NAME = `posta_iso_${Date.now()}`;
const URL = `postgresql://postgres:postgres@localhost:5433/${DB_NAME}`;

const ACME = scopeFor(1, 10);
const RIVAL = scopeFor(2, 20);

let db: PgClient;
let repo: MessageRepository;
let rivalId: string;

beforeAll(async () => {
  const admin = new PgClient(ADMIN);
  await admin.exec(`CREATE DATABASE ${DB_NAME}`);
  await admin.close();

  db = new PgClient(URL);
  await db.exec(MESSAGE_STORE_DDL);
  for (const table of ['messages', 'deliveries', 'links', 'clicks', 'loads', 'spam_checks']) {
    for (const { year, month } of partitionsToEnsure(new Date())) {
      await db.exec(partitionDDL(table, year, month));
    }
  }

  repo = new MessageRepository(db);
  await repo.create(ACME, { scope: 'outgoing', rcpt_to: 'a@acme.test', status: 'Sent' });
  rivalId = (await repo.create(RIVAL, { scope: 'outgoing', rcpt_to: 'b@rival.test', status: 'Sent' }))
    .id;
});

afterAll(async () => {
  await db?.close();
});

describe('reads are confined to the tenant', () => {
  it('lists only its own messages', async () => {
    const rows = await repo.list(ACME);
    expect(rows).toHaveLength(1);
    expect(rows[0].rcpt_to).toBe('a@acme.test');
  });

  it("cannot fetch another tenant's message by its real id", async () => {
    // The core attack: ids are globally unique in v2, so holding one is not
    // authorisation to read it.
    expect(await repo.find(ACME, rivalId)).toBeUndefined();
  });

  it('returns the same "not found" for a foreign id as for a missing one', async () => {
    // A distinguishable error would let someone enumerate which ids exist
    // elsewhere — an information leak even without the contents.
    expect(await repo.find(ACME, rivalId)).toBe(await repo.find(ACME, 999_999_999));
  });

  it('counts only its own messages', async () => {
    expect(await repo.countByStatus(ACME)).toEqual({ Sent: 1 });
    expect(await repo.countByStatus(RIVAL)).toEqual({ Sent: 1 });
  });

  it('confines filtered queries too', async () => {
    // Adding a condition must narrow the result, never widen it past the
    // tenant predicate.
    expect(await repo.list(ACME, { status: 'Sent' })).toHaveLength(1);
    expect(await repo.list(ACME, { status: 'Held' })).toHaveLength(0);
  });
});

describe('writes are confined to the tenant', () => {
  it("cannot update another tenant's message", async () => {
    expect(await repo.updateStatus(ACME, rivalId, 'Held')).toBeUndefined();

    // And the row is genuinely untouched, not merely unreported.
    expect((await repo.find(RIVAL, rivalId))?.status).toBe('Sent');
  });

  it('attributes new messages to the scope, not to the payload', async () => {
    // A caller passing tenant_id in the body must not override the scope it
    // was given.
    const created = await repo.create(ACME, {
      scope: 'outgoing',
      rcpt_to: 'c@acme.test',
      ...({ tenant_id: RIVAL.tenantId } as object),
    });
    expect(created.tenant_id).toBe(String(ACME.tenantId));
  });

  it('refuses to create without a server', async () => {
    await expect(
      repo.create(scopeFor(1), { scope: 'outgoing', rcpt_to: 'd@acme.test' }),
    ).rejects.toThrow('narrowed to a server');
  });
});

describe('server scoping within a tenant', () => {
  it('narrows to one server when asked', async () => {
    expect(await repo.list(scopeFor(1, 99))).toHaveLength(0);
    expect((await repo.list(scopeFor(1, 10))).length).toBeGreaterThan(0);
  });

  it('sees every server when not narrowed', async () => {
    const all = await repo.list(scopeFor(1));
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((r) => r.tenant_id === '1')).toBe(true);
  });
});

describe('scope construction', () => {
  it('always puts the tenant predicate first', () => {
    // It leads every v2 index, so scoping and performance agree.
    expect(where(scopeFor(7)).sql.startsWith('tenant_id = $1')).toBe(true);
  });

  it.each([0, -1, 1.5, NaN])('rejects %p as a tenant id', (bad) => {
    // These are what a missing session or a failed parse produce. Coerced
    // into a query they would match nothing and read as "no data".
    expect(() => scopeFor(bad as number)).toThrow(InvalidScopeError);
  });

  it('numbers appended placeholders after the scope', () => {
    const clause = and(where(scopeFor(1, 2)), 'status = ?', 'Sent');
    expect(clause.sql).toBe('tenant_id = $1 AND server_id = $2 AND status = $3');
    expect(clause.params).toEqual([1, 2, 'Sent']);
  });

  it('rejects a fragment whose placeholder count does not match its values', () => {
    // A miscount shifts every later parameter, which can move a value into
    // the tenant position — a numbering slip becoming a cross-tenant read.
    expect(() => and(where(scopeFor(1)), 'a = ? AND b = ?', 'only-one')).toThrow(InvalidScopeError);
  });
});

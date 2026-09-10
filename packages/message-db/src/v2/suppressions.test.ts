import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { MESSAGE_STORE_DDL, PgClient } from '@posta/core';
import { SuppressionRepository } from './suppressions';
import { scopeFor } from './scope';

/**
 * Suppression behaviour, against real Postgres.
 *
 * Every case here is one where the wrong answer means sending mail that
 * should not have been sent. That failure is not visible in logs, raises no
 * error, and shows up weeks later as a deliverability collapse — so it has to
 * be caught here or not at all.
 */

const ADMIN = 'postgresql://postgres:postgres@localhost:5433/postgres';
const DB_NAME = `posta_supp_${Date.now()}`;
const URL = `postgresql://postgres:postgres@localhost:5433/${DB_NAME}`;

const SERVER_A = scopeFor(1, 10);
const SERVER_B = scopeFor(1, 20);
const TENANT_WIDE = scopeFor(1);
const OTHER_TENANT = scopeFor(2, 30);

let db: PgClient;
let repo: SuppressionRepository;

const past = () => new Date(Date.now() - 60_000);
const future = () => new Date(Date.now() + 3_600_000);

beforeAll(async () => {
  const admin = new PgClient(ADMIN);
  await admin.exec(`CREATE DATABASE ${DB_NAME}`);
  await admin.close();
  db = new PgClient(URL);
  await db.exec(MESSAGE_STORE_DDL);
  repo = new SuppressionRepository(db);
});

afterAll(async () => {
  await db?.close();
});

describe('suppression blocks sending', () => {
  it('blocks an address that was suppressed', async () => {
    await repo.suppress(SERVER_A, 'bounced@acme.test', 'hard_bounce');
    expect((await repo.isSuppressed(SERVER_A, 'bounced@acme.test'))?.reason).toBe('hard_bounce');
  });

  it('matches case-insensitively', async () => {
    // Addresses arrive from bounce reports in whatever case the remote server
    // used. A case-sensitive match would silently resume sending.
    expect(await repo.isSuppressed(SERVER_A, 'BOUNCED@ACME.TEST')).toBeDefined();
    expect(await repo.isSuppressed(SERVER_A, 'Bounced@Acme.Test')).toBeDefined();
  });

  it('does not block an address that was never suppressed', async () => {
    expect(await repo.isSuppressed(SERVER_A, 'fine@acme.test')).toBeUndefined();
  });
});

describe('scope of a suppression', () => {
  it('confines a server-level suppression to that server', async () => {
    await repo.suppress(SERVER_A, 'only-a@acme.test', 'manual');
    expect(await repo.isSuppressed(SERVER_A, 'only-a@acme.test')).toBeDefined();
    expect(await repo.isSuppressed(SERVER_B, 'only-a@acme.test')).toBeUndefined();
  });

  it('applies a tenant-wide suppression to every server', async () => {
    // The point of a tenant-wide entry — usually a spam complaint — is that
    // it cannot be escaped by sending from a different server.
    await repo.suppress(TENANT_WIDE, 'complained@acme.test', 'complaint');
    expect(await repo.isSuppressed(SERVER_A, 'complained@acme.test')).toBeDefined();
    expect(await repo.isSuppressed(SERVER_B, 'complained@acme.test')).toBeDefined();
  });

  it('never leaks a suppression across tenants', async () => {
    expect(await repo.isSuppressed(OTHER_TENANT, 'bounced@acme.test')).toBeUndefined();
  });

  it('will not let one server lift a tenant-wide suppression', async () => {
    // Otherwise a complaint could be undone by whichever server happened to
    // want to keep sending.
    expect(await repo.unsuppress(SERVER_A, 'complained@acme.test')).toBe(false);
    expect(await repo.isSuppressed(SERVER_B, 'complained@acme.test')).toBeDefined();
  });
});

describe('expiry', () => {
  it('ignores an entry whose expiry has passed', async () => {
    await repo.suppress(SERVER_A, 'expired@acme.test', 'manual', past());
    expect(await repo.isSuppressed(SERVER_A, 'expired@acme.test')).toBeUndefined();
  });

  it('honours an entry that has not expired yet', async () => {
    await repo.suppress(SERVER_A, 'temporary@acme.test', 'manual', future());
    expect(await repo.isSuppressed(SERVER_A, 'temporary@acme.test')).toBeDefined();
  });

  it('treats a null expiry as permanent', async () => {
    await repo.suppress(SERVER_A, 'permanent@acme.test', 'hard_bounce');
    expect((await repo.isSuppressed(SERVER_A, 'permanent@acme.test'))?.expires_at).toBeNull();
  });
});

describe('re-suppressing widens, never narrows', () => {
  it('does not error when the same address bounces twice', async () => {
    // The bounce handler processes batches; a unique violation here would
    // abort the rest of the batch.
    await repo.suppress(SERVER_A, 'twice@acme.test', 'hard_bounce');
    await repo.suppress(SERVER_A, 'twice@acme.test', 'hard_bounce');
    expect(await repo.isSuppressed(SERVER_A, 'twice@acme.test')).toBeDefined();
  });

  it('keeps a permanent suppression permanent when a temporary one follows', async () => {
    // The dangerous case: a soft-bounce arriving after a hard-bounce must not
    // convert a permanent block into one that expires in an hour and resumes
    // sending to a dead mailbox.
    await repo.suppress(SERVER_A, 'perm-first@acme.test', 'hard_bounce');
    await repo.suppress(SERVER_A, 'perm-first@acme.test', 'soft_bounce', future());
    expect((await repo.isSuppressed(SERVER_A, 'perm-first@acme.test'))?.expires_at).toBeNull();
  });

  it('extends an expiry rather than shortening it', async () => {
    const soon = new Date(Date.now() + 60_000);
    const later = new Date(Date.now() + 7_200_000);
    await repo.suppress(SERVER_A, 'extend@acme.test', 'manual', later);
    await repo.suppress(SERVER_A, 'extend@acme.test', 'manual', soon);
    const hit = await repo.isSuppressed(SERVER_A, 'extend@acme.test');
    expect(hit!.expires_at!.getTime()).toBeGreaterThan(soon.getTime() + 1000);
  });
});

describe('pruning', () => {
  it('removes expired entries', async () => {
    await repo.suppress(SERVER_B, 'stale@acme.test', 'manual', past());
    expect(await repo.pruneExpired(SERVER_B)).toBeGreaterThan(0);
  });

  it('never removes a permanent suppression', async () => {
    // A prune that swept permanent entries would resume sending to every
    // hard-bounced address at once.
    await repo.suppress(SERVER_B, 'keep-forever@acme.test', 'hard_bounce');
    await repo.pruneExpired(SERVER_B);
    expect(await repo.isSuppressed(SERVER_B, 'keep-forever@acme.test')).toBeDefined();
  });

  it('never removes an entry that has not expired', async () => {
    await repo.suppress(SERVER_B, 'still-valid@acme.test', 'manual', future());
    await repo.pruneExpired(SERVER_B);
    expect(await repo.isSuppressed(SERVER_B, 'still-valid@acme.test')).toBeDefined();
  });
});

describe('unsuppressing', () => {
  it('removes a server-level suppression and reports it did', async () => {
    await repo.suppress(SERVER_A, 'lift@acme.test', 'manual');
    expect(await repo.unsuppress(SERVER_A, 'lift@acme.test')).toBe(true);
    expect(await repo.isSuppressed(SERVER_A, 'lift@acme.test')).toBeUndefined();
  });

  it('reports false when nothing matched', async () => {
    expect(await repo.unsuppress(SERVER_A, 'never-there@acme.test')).toBe(false);
  });
});

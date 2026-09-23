import { describe, it, expect } from 'bun:test';
import { Elysia } from 'elysia';
import type { Queryable } from '@posta/core';
import { resolveUser, type ClerkProfile } from '../middleware/current-user';
import { requireAdmin, requireClerkAuth } from '../middleware/require-auth';
import { app } from '../index';

interface UserRow {
  id: number;
  uuid: string;
  first_name: string | null;
  last_name: string | null;
  email_address: string | null;
  admin: number;
  oidc_uid: string | null;
}

/**
 * Just enough of the users table to run resolveUser against, keyed on the
 * statements it issues. An unrecognised statement fails the test rather than
 * silently returning nothing.
 */
class FakeDb implements Queryable {
  rows: UserRow[] = [];
  locks = 0;
  private nextId = 1;

  add(row: Partial<UserRow>): UserRow {
    const full: UserRow = {
      id: this.nextId++, uuid: 'x', first_name: null, last_name: null,
      email_address: null, admin: 0, oidc_uid: null, ...row,
    };
    this.rows.push(full);
    return full;
  }

  private pick(r: UserRow) {
    return { id: r.id, admin: r.admin, email_address: r.email_address, first_name: r.first_name, last_name: r.last_name };
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const s = sql.replace(/\s+/g, ' ').trim();
    const anyAdmin = this.rows.some((r) => r.admin !== 0);
    const byUid = this.rows.find((r) => r.oidc_uid === params[0]);

    if (s.includes('pg_advisory_xact_lock')) { this.locks++; return [{}] as T[]; }
    if (s.includes('AS admin_exists')) {
      return (byUid ? [{ ...this.pick(byUid), admin_exists: anyAdmin }] : []) as T[];
    }
    if (s.startsWith('SELECT 1 AS one')) return (anyAdmin ? [{ one: 1 }] : []) as T[];
    if (s.startsWith('SELECT id, admin') && s.includes('WHERE oidc_uid = $1')) {
      return (byUid ? [this.pick(byUid)] : []) as T[];
    }
    if (s.startsWith('UPDATE users SET oidc_uid')) {
      const [uid, first, last, email] = params;
      const r = this.rows
        .filter((r) => r.oidc_uid === null && r.email_address?.toLowerCase() === email.toLowerCase())
        .sort((a, b) => a.id - b.id)[0];
      if (!r) return [];
      r.oidc_uid = uid;
      r.first_name ??= first;
      r.last_name ??= last;
      return [this.pick(r)] as T[];
    }
    if (s.startsWith('INSERT INTO users')) {
      const [uuid, first, last, email, uid] = params;
      const r = this.add({ uuid, first_name: first, last_name: last, email_address: email, admin: 1, oidc_uid: uid });
      return [this.pick(r)] as T[];
    }
    if (s.startsWith('UPDATE users SET admin = 1')) {
      const r = this.rows.find((r) => r.id === params[0])!;
      r.admin = 1;
      return [this.pick(r)] as T[];
    }
    throw new Error(`FakeDb: unexpected statement: ${s}`);
  }

  async get<T = any>(sql: string, params?: any[]): Promise<T | undefined> {
    return (await this.query<T>(sql, params))[0];
  }

  async run(): Promise<never> { throw new Error('FakeDb: run() not expected'); }
  async exec(): Promise<never> { throw new Error('FakeDb: exec() not expected'); }
  async transaction<T>(fn: (client: Queryable) => Promise<T>): Promise<T> { return fn(this); }
}

const profile = (p: Partial<ClerkProfile> = {}) => async (): Promise<ClerkProfile> => ({
  email: 'ada@example.com', emailVerified: true, firstName: 'Ada', lastName: 'Lovelace', ...p,
});

const neverCalled = async (): Promise<ClerkProfile> => {
  throw new Error('the Clerk profile should not be loaded');
};

describe('resolveUser', () => {
  it('makes the first person to sign in the administrator', async () => {
    const db = new FakeDb();
    const user = await resolveUser(db, 'user_a', profile());

    expect(user).toMatchObject({ admin: true, email_address: 'ada@example.com', first_name: 'Ada' });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].oidc_uid).toBe('user_a');
    expect(db.locks).toBe(1);
  });

  it('returns a linked account without provisioning anything', async () => {
    const db = new FakeDb();
    db.add({ admin: 1, oidc_uid: 'user_a', email_address: 'ada@example.com' });

    const user = await resolveUser(db, 'user_a', neverCalled);

    expect(user).toMatchObject({ id: 1, admin: true });
    expect(db.locks).toBe(0);
  });

  it('links an account an administrator added, by verified email', async () => {
    const db = new FakeDb();
    db.add({ admin: 1, oidc_uid: 'user_admin' });
    const invited = db.add({ email_address: 'Bob@Example.com' });

    const user = await resolveUser(db, 'user_b', profile({ email: 'bob@example.com', firstName: 'Bob', lastName: null }));

    expect(user).toMatchObject({ id: invited.id, admin: false, first_name: 'Bob' });
    expect(invited.oidc_uid).toBe('user_b');
  });

  it('does not link on an unverified email address', async () => {
    const db = new FakeDb();
    db.add({ admin: 1, oidc_uid: 'user_admin' });
    const invited = db.add({ email_address: 'bob@example.com' });

    const user = await resolveUser(db, 'user_b', profile({ email: 'bob@example.com', emailVerified: false }));

    expect(user).toBeNull();
    expect(invited.oidc_uid).toBeNull();
  });

  it('turns away someone nobody added', async () => {
    const db = new FakeDb();
    db.add({ admin: 1, oidc_uid: 'user_admin' });

    const user = await resolveUser(db, 'user_stranger', profile({ email: 'stranger@example.com' }));

    expect(user).toBeNull();
    expect(db.rows).toHaveLength(1);
  });

  it('promotes an existing account when the installation has no administrator', async () => {
    const db = new FakeDb();
    db.add({ admin: 0, oidc_uid: 'user_a' });

    const user = await resolveUser(db, 'user_a', neverCalled);

    expect(user?.admin).toBe(true);
    expect(db.rows[0].admin).toBe(1);
  });
});

describe('requireClerkAuth', () => {
  const appWith = (ctx: Record<string, unknown>) =>
    new Elysia()
      .derive({ as: 'scoped' }, () => ctx)
      .use(requireClerkAuth)
      .get('/x', () => ({ ok: true }));

  const status = async (ctx: Record<string, unknown>) =>
    (await appWith(ctx).handle(new Request('http://localhost/x'))).status;

  it('answers 401 when nobody is signed in', async () => {
    expect(await status({ clerk: { authenticated: false }, user: null, userError: null })).toBe(401);
  });

  it('answers 403 for a signed-in Clerk user with no Posta account', async () => {
    const res = await appWith({ clerk: { authenticated: true }, user: null, userError: null })
      .handle(new Request('http://localhost/x'));
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error).toBe('NotProvisioned');
  });

  it('answers 503 when the account could not be looked up', async () => {
    expect(await status({ clerk: { authenticated: true }, user: null, userError: 'db down' })).toBe(503);
  });

  it('lets a provisioned user through', async () => {
    expect(await status({ clerk: { authenticated: true }, user: { id: 1, admin: false }, userError: null })).toBe(200);
  });
});

describe('requireAdmin', () => {
  it('refuses a non-administrator', () => {
    const set: any = {};
    expect(requireAdmin({ user: { admin: false }, set })).toMatchObject({ error: 'AdminRequired' });
    expect(set.status).toBe(403);
  });

  it('lets an administrator through', () => {
    expect(requireAdmin({ user: { admin: true }, set: {} })).toBeUndefined();
  });
});

describe('web-server auth wiring', () => {
  const get = (path: string, init?: RequestInit) => app.handle(new Request(`http://localhost${path}`, init));

  it('requires sign-in on dashboard routes', async () => {
    for (const path of ['/users', '/organizations', '/ip_pools', '/settings', '/me']) {
      expect({ path, status: (await get(path)).status }).toEqual({ path, status: 401 });
    }
  });

  it('keeps health checks public', async () => {
    expect((await get('/health')).status).toBe(200);
  });

  it('keeps the JWKS endpoint outside the dashboard guard', async () => {
    expect((await get('/.well-known/jwks.json')).status).not.toBe(401);
  });

  it('leaves the sending API to its own API-key auth', async () => {
    const res = await get('/api/v1/send/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'a@example.com' }),
    });
    const body = (await res.json()) as any;
    expect(body.error).not.toBe('Unauthorized');
    expect(body.status).toBe('error');
  });
});

import { describe, expect, it } from 'bun:test';
import { SmtpConnectionPool, poolKey } from './pool';
import type { SmtpSession } from './session';

/**
 * Pool behaviour, against fake sessions.
 *
 * No sockets here on purpose: what needs proving is when a connection is
 * reused, retired, or refused, and real sockets would make those decisions
 * harder to observe rather than easier. The dialog itself is covered against
 * a real peer in session.test.ts.
 */

let nextId = 0;
type Fake = SmtpSession & { id: number; closed: boolean };

function fakeSession(): Fake {
  const s = {
    id: ++nextId,
    closed: false,
    close() {
      s.closed = true;
    },
  };
  return s as unknown as Fake;
}

const connect = async () => fakeSession();
const idOf = async (s: SmtpSession) => (s as Fake).id;
const KEY = poolKey('gmail-smtp-in.l.google.com', 25);

describe('reuse', () => {
  it('opens a connection on first use', async () => {
    const pool = new SmtpConnectionPool();
    const id = await pool.withConnection(KEY, connect, idOf);
    expect(pool.stats().created).toBe(1);
    expect(id).toBeGreaterThan(0);
  });

  it('reuses the same connection for the same destination', async () => {
    // The whole point: a second message must not pay for another TCP and TLS
    // handshake, and must not look like connection churn to the provider.
    const pool = new SmtpConnectionPool();
    const first = await pool.withConnection(KEY, connect, idOf);
    const second = await pool.withConnection(KEY, connect, idOf);

    expect(second).toBe(first);
    expect(pool.stats().created).toBe(1);
    expect(pool.stats().reused).toBe(1);
  });

  it('keeps destinations apart', async () => {
    // A connection to Gmail is not a connection to Outlook.
    const pool = new SmtpConnectionPool();
    const a = await pool.withConnection(KEY, connect, idOf);
    const b = await pool.withConnection(
      poolKey('outlook-com.olc.protection.outlook.com', 25),
      connect,
      idOf,
    );
    expect(b).not.toBe(a);
    expect(pool.stats().created).toBe(2);
  });

  it('treats a different port as a different destination', () => {
    expect(poolKey('mx.test', 25)).not.toBe(poolKey('mx.test', 587));
  });

  it('is case-insensitive about the hostname', () => {
    expect(poolKey('MX.Test', 25)).toBe(poolKey('mx.test', 25));
  });

  it('raises messages per connection above one', async () => {
    const pool = new SmtpConnectionPool();
    for (let i = 0; i < 10; i++) await pool.withConnection(KEY, connect, async () => i);
    expect(pool.stats().reuseRatio).toBe(10);
  });
});

describe('retirement', () => {
  it('retires a connection at the message limit', async () => {
    // Providers cap messages per connection and close it at the limit.
    // Retiring first turns a mid-transaction disconnect into a reconnect.
    const pool = new SmtpConnectionPool({ maxUses: 3 });
    const ids: number[] = [];
    for (let i = 0; i < 4; i++) ids.push(await pool.withConnection(KEY, connect, idOf));

    expect(ids[0]).toBe(ids[2]);
    expect(ids[3]).not.toBe(ids[0]);
    expect(pool.stats().created).toBe(2);
  });

  it('retires a connection that has been idle too long', async () => {
    // The far end closes idle connections without telling us, so handing a
    // message to one is a silent failure.
    const pool = new SmtpConnectionPool({ idleTimeoutMs: 0 });
    const first = await pool.withConnection(KEY, connect, idOf);
    await new Promise((r) => setTimeout(r, 5));
    const second = await pool.withConnection(KEY, connect, idOf);

    expect(second).not.toBe(first);
    expect(pool.stats().created).toBe(2);
  });

  it('closes the surplus rather than holding it', async () => {
    // Idle connections are counted against us by the provider, so holding
    // more than maxPerKey is worse than closing them.
    const pool = new SmtpConnectionPool({ maxPerKey: 2 });
    const sessions = [fakeSession(), fakeSession(), fakeSession()];
    let i = 0;

    // Three concurrent transactions force three connections open at once.
    await Promise.all(
      sessions.map(() =>
        pool.withConnection(
          KEY,
          async () => sessions[i++],
          async () => new Promise((r) => setTimeout(r, 5)),
        ),
      ),
    );

    expect(pool.stats().idle).toBe(2);
    expect(sessions.filter((s) => s.closed)).toHaveLength(1);
  });
});

describe('failure', () => {
  it('never pools a connection whose transaction threw', async () => {
    // A failed transaction may leave unread replies buffered. Reusing it
    // would give the *next* message someone else's response — the worst
    // outcome available, because it corrupts a message that succeeded.
    const pool = new SmtpConnectionPool();
    const session = fakeSession();

    await expect(
      pool.withConnection(
        KEY,
        async () => session,
        async () => {
          throw new Error('remote closed mid-transaction');
        },
      ),
    ).rejects.toThrow('remote closed');

    expect(session.closed).toBe(true);
    expect(pool.stats().idle).toBe(0);
  });

  it('propagates the error rather than swallowing it', async () => {
    const pool = new SmtpConnectionPool();
    await expect(
      pool.withConnection(KEY, connect, async () => {
        throw new Error('550 rejected');
      }),
    ).rejects.toThrow('550 rejected');
  });

  it('opens a fresh connection after a failure', async () => {
    const pool = new SmtpConnectionPool();
    await pool
      .withConnection(KEY, connect, async () => {
        throw new Error('boom');
      })
      .catch(() => {});

    await pool.withConnection(KEY, connect, async () => 'ok');
    expect(pool.stats().created).toBe(2);
    expect(pool.stats().reused).toBe(0);
  });
});

describe('drain', () => {
  it('closes everything held', async () => {
    const pool = new SmtpConnectionPool();
    const session = fakeSession();
    await pool.withConnection(
      KEY,
      async () => session,
      async () => 'ok',
    );

    expect(pool.stats().idle).toBe(1);
    pool.drain();
    expect(pool.stats().idle).toBe(0);
    expect(session.closed).toBe(true);
  });
});

import { describe, expect, it } from 'bun:test';
import {
  DivergenceLog,
  DualWriteMessages,
  canAdvance,
  readsV2,
  writesLegacy,
  writesV2,
  type MigrationMode,
} from './migration-mode';
import { scopeFor } from './scope';
import type { MessageRepository } from './messages';

/**
 * Cutover behaviour, against in-memory stubs.
 *
 * The database is not what makes this risky — the mode logic is. Every test
 * here is a question of the form "when one store fails, does a customer's
 * message survive".
 */

const SCOPE = scopeFor(1, 10);
const MESSAGE = { scope: 'outgoing', rcpt_to: 'a@acme.test' };

function stubs(options: { legacyFails?: boolean; v2Fails?: boolean } = {}) {
  const legacyRows: Array<Record<string, unknown>> = [];
  const v2Rows: Array<Record<string, unknown>> = [];

  const legacy = {
    async create(m: Record<string, unknown>) {
      if (options.legacyFails) throw new Error('legacy is down');
      legacyRows.push(m);
      return { id: legacyRows.length };
    },
    async list() {
      return legacyRows;
    },
  };

  const v2 = {
    async create(_scope: unknown, m: unknown) {
      if (options.v2Fails) throw new Error('v2 is down');
      v2Rows.push(m as Record<string, unknown>);
      return { id: String(v2Rows.length) };
    },
    async list() {
      return v2Rows;
    },
  } as unknown as MessageRepository;

  return { legacy, v2, legacyRows, v2Rows };
}

const build = (mode: MigrationMode, options?: { legacyFails?: boolean; v2Fails?: boolean }) => {
  const s = stubs(options);
  return { ...s, store: new DualWriteMessages(mode, s.legacy, s.v2) };
};

describe('what each mode writes', () => {
  it('legacy writes only the legacy store', async () => {
    const { store, legacyRows, v2Rows } = build('legacy');
    await store.create(SCOPE, MESSAGE);
    expect(legacyRows).toHaveLength(1);
    expect(v2Rows).toHaveLength(0);
  });

  it('dual writes both', async () => {
    const { store, legacyRows, v2Rows } = build('dual');
    await store.create(SCOPE, MESSAGE);
    expect(legacyRows).toHaveLength(1);
    expect(v2Rows).toHaveLength(1);
  });

  it('v2-read still writes both, so falling back stays possible', async () => {
    // The point of a separate read switch: reads move first, and writes keep
    // both stores complete until the rollback window closes.
    const { store, legacyRows, v2Rows } = build('v2-read');
    await store.create(SCOPE, MESSAGE);
    expect(legacyRows).toHaveLength(1);
    expect(v2Rows).toHaveLength(1);
  });

  it('v2 stops writing legacy', async () => {
    const { store, legacyRows, v2Rows } = build('v2');
    await store.create(SCOPE, MESSAGE);
    expect(legacyRows).toHaveLength(0);
    expect(v2Rows).toHaveLength(1);
  });
});

describe('which store reads come from', () => {
  it.each([
    ['legacy', false],
    ['dual', false],
    ['v2-read', true],
    ['v2', true],
  ] as Array<[MigrationMode, boolean]>)('%s reads v2: %p', (mode, expected) => {
    expect(readsV2(mode)).toBe(expected);
  });

  it('dual reads legacy even though both are written', async () => {
    // v2 is being populated but must not reach a customer yet.
    const { store, v2Rows } = build('dual');
    await store.create(SCOPE, MESSAGE);
    v2Rows.push({ rcpt_to: 'ghost@acme.test' }); // only in v2
    expect(await store.list(SCOPE)).toHaveLength(1);
  });
});

describe('failure is handled asymmetrically', () => {
  it('does not fail a send when the shadow store is down', async () => {
    // The message was accepted by the authoritative store. Throwing here
    // would turn a migration defect into lost mail.
    const { store, legacyRows } = build('dual', { v2Fails: true });
    const result = await store.create(SCOPE, MESSAGE);
    expect(result.id).toBeTruthy();
    expect(legacyRows).toHaveLength(1);
  });

  it('records the shadow failure rather than swallowing it silently', async () => {
    const { store } = build('dual', { v2Fails: true });
    await store.create(SCOPE, MESSAGE);
    expect(store.divergences.count).toBe(1);
    expect(store.divergences.all[0].detail).toContain('v2 write failed');
  });

  it('does fail the send when the authoritative store is down', async () => {
    // The caller has to learn their message was not accepted.
    const { store } = build('dual', { legacyFails: true });
    await expect(store.create(SCOPE, MESSAGE)).rejects.toThrow('legacy is down');
  });

  it('fails the send when v2 is authoritative and v2 is down', async () => {
    const { store } = build('v2', { v2Fails: true });
    await expect(store.create(SCOPE, MESSAGE)).rejects.toThrow('v2 is down');
  });
});

describe('comparison', () => {
  it('reports a match when both stores agree', async () => {
    const { store } = build('dual');
    await store.create(SCOPE, MESSAGE);
    expect(await store.compare(SCOPE)).toMatchObject({ legacy: 1, v2: 1, matched: true });
  });

  it('records a divergence when they disagree', async () => {
    // What a broken backfill actually looks like from the application's side.
    const { store, v2Rows } = build('dual');
    await store.create(SCOPE, MESSAGE);
    v2Rows.push({ rcpt_to: 'extra@acme.test' });

    expect((await store.compare(SCOPE)).matched).toBe(false);
    expect(store.divergences.count).toBe(1);
  });
});

describe('DivergenceLog', () => {
  it('is healthy only when nothing diverged', () => {
    const log = new DivergenceLog();
    expect(log.healthy).toBe(true);
    log.record('create', 'boom');
    expect(log.healthy).toBe(false);
  });

  it('keeps the first occurrences and counts the rest', () => {
    // The first divergence after a deploy is the diagnostic one; the
    // ten-thousandth is the same fault repeating, and would evict it.
    const log = new DivergenceLog(2);
    log.record('create', 'first');
    log.record('create', 'second');
    log.record('create', 'third');

    expect(log.all).toHaveLength(2);
    expect(log.all[0].detail).toBe('first');
    expect(log.count).toBe(3);
  });
});

describe('advancing between modes', () => {
  const clean = new DivergenceLog();
  const dirty = new DivergenceLog();
  dirty.record('create', 'v2 write failed');

  it('allows one step forward when clean', () => {
    expect(canAdvance('legacy', 'dual', clean).allowed).toBe(true);
    expect(canAdvance('dual', 'v2-read', clean).allowed).toBe(true);
  });

  it('refuses to skip a stage', () => {
    // The pressure to jump straight to v2 is highest when the migration has
    // been dragging on, which is exactly when it is least safe.
    const result = canAdvance('dual', 'v2', clean);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('cannot skip');
  });

  it('refuses to advance while divergences are outstanding', () => {
    const result = canAdvance('dual', 'v2-read', dirty);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('divergence');
  });

  it('always allows retreating, even with divergences', () => {
    // The rollback path must not be gated on the same checks that gate
    // progress, or a bad deploy cannot be undone.
    expect(canAdvance('v2-read', 'dual', dirty).allowed).toBe(true);
    expect(canAdvance('v2', 'legacy', dirty).allowed).toBe(true);
  });

  it('allows staying put', () => {
    expect(canAdvance('dual', 'dual', dirty).allowed).toBe(true);
  });
});

describe('mode predicates', () => {
  it('never leaves both stores unwritten', () => {
    // Every mode must write somewhere, or a send silently goes nowhere.
    for (const mode of ['legacy', 'dual', 'v2-read', 'v2'] as MigrationMode[]) {
      expect(writesLegacy(mode) || writesV2(mode)).toBe(true);
    }
  });
});

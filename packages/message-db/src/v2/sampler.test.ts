import { describe, expect, it } from 'bun:test';
import { ComparisonSampler, readyToAdvance } from './sampler';
import { DualWriteMessages } from './migration-mode';
import { scopeFor } from './scope';
import type { MessageRepository } from './messages';

const SCOPE = scopeFor(1, 10);

/** Two stores that agree, disagree, or throw, on demand. */
function store(behaviour: 'agree' | 'diverge' | 'throw') {
  const legacyRows = [{ id: 1 }];
  const v2Rows = behaviour === 'diverge' ? [{ id: 1 }, { id: 2 }] : [{ id: 1 }];

  const legacy = {
    async create() {
      return { id: 1 };
    },
    async list() {
      if (behaviour === 'throw') throw new Error('legacy unreachable');
      return legacyRows;
    },
  };
  const v2 = {
    async list() {
      return v2Rows;
    },
  } as unknown as MessageRepository;

  return new DualWriteMessages('dual', legacy, v2);
}

/** Deterministic sequence, so sampling decisions are assertable. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('sampling decisions', () => {
  it('never samples at rate 0', () => {
    expect(new ComparisonSampler(0, () => 0).shouldSample()).toBe(false);
  });

  it('always samples at rate 1', () => {
    expect(new ComparisonSampler(1, () => 0.99).shouldSample()).toBe(true);
  });

  it('samples roughly in proportion to the rate', () => {
    const s = new ComparisonSampler(0.25, sequence([0.1, 0.3, 0.2, 0.9]));
    expect([s.shouldSample(), s.shouldSample(), s.shouldSample(), s.shouldSample()]).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it('rejects a nonsensical rate rather than silently clamping', () => {
    expect(() => new ComparisonSampler(1.5)).toThrow('between 0 and 1');
    expect(() => new ComparisonSampler(-1)).toThrow('between 0 and 1');
  });
});

describe('comparing', () => {
  it('records a match', async () => {
    const s = new ComparisonSampler(1);
    await s.maybeCompare(store('agree'), SCOPE);
    expect(s.stats()).toMatchObject({ compared: 1, matched: 1, diverged: 0 });
  });

  it('records a divergence', async () => {
    const s = new ComparisonSampler(1);
    await s.maybeCompare(store('diverge'), SCOPE);
    expect(s.stats()).toMatchObject({ compared: 1, matched: 0, diverged: 1 });
  });

  it('does nothing when not sampled', async () => {
    const s = new ComparisonSampler(0);
    await s.maybeCompare(store('diverge'), SCOPE);
    expect(s.stats().compared).toBe(0);
  });

  it('swallows an error rather than failing the caller', async () => {
    // A verification mechanism that can fail a customer's request is the
    // first thing switched off during an incident, usually for good.
    const s = new ComparisonSampler(1);
    await expect(s.maybeCompare(store('throw'), SCOPE)).resolves.toBeUndefined();
  });

  it('counts an error separately from a divergence', async () => {
    // An unreachable store says nothing about whether the two agree; folding
    // it into the divergence rate would corrupt the number the cutover
    // decision rests on.
    const s = new ComparisonSampler(1);
    await s.maybeCompare(store('throw'), SCOPE);
    expect(s.stats()).toMatchObject({ errored: 1, diverged: 0, compared: 0 });
  });

  it('reports no rate until something has been compared', () => {
    // 0 would read as "perfect"; null cannot be mistaken for a result.
    expect(new ComparisonSampler(1).stats().divergenceRate).toBeNull();
  });

  it('computes the divergence rate over what it actually saw', async () => {
    const s = new ComparisonSampler(1);
    await s.maybeCompare(store('agree'), SCOPE);
    await s.maybeCompare(store('agree'), SCOPE);
    await s.maybeCompare(store('diverge'), SCOPE);
    expect(s.stats().divergenceRate).toBeCloseTo(1 / 3, 5);
  });
});

describe('readyToAdvance', () => {
  const stats = (compared: number, diverged: number) => ({
    compared,
    matched: compared - diverged,
    diverged,
    errored: 0,
    divergenceRate: compared === 0 ? null : diverged / compared,
  });

  it('refuses on too small a sample, even with no divergences', () => {
    // Zero divergences over three comparisons is not evidence of anything.
    const result = readyToAdvance(stats(3, 0));
    expect(result.ready).toBe(false);
    expect(result.reason).toContain('need 1000');
  });

  it('refuses when anything diverged', () => {
    const result = readyToAdvance(stats(5000, 1));
    expect(result.ready).toBe(false);
    expect(result.reason).toContain('1 of 5000');
  });

  it('allows a large clean sample', () => {
    const result = readyToAdvance(stats(1000, 0));
    expect(result.ready).toBe(true);
    expect(result.reason).toContain('no divergences');
  });

  it('never reports ready on an empty sample', () => {
    // "No divergences found" is indistinguishable from "the sampler never
    // ran" unless the denominator is checked.
    expect(readyToAdvance(stats(0, 0)).ready).toBe(false);
  });
});

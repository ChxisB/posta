import { describe, expect, it } from 'bun:test';
import { Recorder, meetsGate, percentiles } from './percentiles';

describe('percentiles', () => {
  it('uses nearest-rank, so every value reported was actually observed', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const p = percentiles(values, [50, 90, 100]);
    // Interpolation would give 5.5 for p50 — a latency nothing experienced.
    expect(p.p50).toBe(5);
    expect(p.p90).toBe(9);
    expect(p.p100).toBe(10);
  });

  it('does not care what order samples arrive in', () => {
    expect(percentiles([9, 1, 5, 3, 7], [50]).p50).toBe(5);
  });

  it('returns NaN rather than 0 for an empty set', () => {
    // 0 would read as "instant" on a dashboard. NaN cannot be mistaken for a
    // good result.
    expect(percentiles([], [50]).p50).toBeNaN();
  });

  it('never reads past the end of the array at p100', () => {
    expect(percentiles([42], [50, 99, 99.9, 100]).p100).toBe(42);
  });
});

describe('Recorder coordinated omission', () => {
  it('measures from when a send was due, not when it started', () => {
    // The system stalls for 500ms: the send was due at t=0, actually began at
    // t=500, and took 50ms of real work. A caller waited 550ms.
    const r = new Recorder();
    r.record('total', 550, 0, 500);
    expect(r.report()[0].percentiles.p50).toBe(550);
  });

  it('counts how many sends the harness started late', () => {
    const r = new Recorder();
    r.record('total', 10, 0, 0); // on time
    r.record('total', 600, 0, 500); // 500ms late
    r.record('total', 300, 0, 200); // 200ms late
    expect(r.lateStarts).toBe(2);
  });

  it('would have hidden the stall had it measured from the start time', () => {
    // Guards the actual regression: a naive harness records endedAt-startedAt
    // (50ms here) and reports a healthy p99 for a system that froze.
    const r = new Recorder();
    r.record('total', 550, 0, 500);
    const naive = 550 - 500;
    expect(r.report()[0].percentiles.p50).toBeGreaterThan(naive);
  });

  it('keeps stages separate and reports them in pipeline order', () => {
    const r = new Recorder();
    r.recordDuration('total', 400);
    r.recordDuration('tcp', 5);
    r.recordDuration('tls', 90);
    expect(r.report().map((s) => s.stage)).toEqual(['tcp', 'tls', 'total']);
  });

  it('omits stages with no samples rather than reporting zeroes', () => {
    const r = new Recorder();
    r.recordDuration('total', 1);
    expect(r.report().map((s) => s.stage)).toEqual(['total']);
  });
});

describe('meetsGate', () => {
  const report = (p50: number, p99: number) => [
    {
      stage: 'total' as const,
      count: 100,
      min: p50,
      max: p99,
      percentiles: { p50, p95: p99, p99, 'p99.9': p99 },
    },
  ];

  it('passes a run inside the target', () => {
    expect(meetsGate(report(320, 800)).pass).toBe(true);
  });

  it('fails on p99 even when p50 looks excellent', () => {
    // The failure mode the spike exists to catch: a fast median hiding a
    // deferral-bound tail.
    const result = meetsGate(report(50, 4000));
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('p99');
  });

  it('fails a run with no samples instead of vacuously passing', () => {
    const result = meetsGate([]);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('no total-stage samples');
  });
});

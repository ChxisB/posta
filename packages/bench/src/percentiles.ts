/**
 * Latency accounting for the delivery benchmark.
 *
 * The whole point of this harness is p99, so the two things that most often
 * make a benchmark lie are handled here rather than at the call sites:
 *
 *  1. Coordinated omission. See `Recorder.record` — latency is measured from
 *     the time a send was *due*, not the time it actually started.
 *  2. Averages. Nothing here reports a mean. A mean hides exactly the tail
 *     this project exists to shrink.
 */

/** The stages of a single delivery attempt, in the order they happen. */
export const STAGES = [
  'accept',
  'pickup',
  'mx_lookup',
  'tcp',
  'tls',
  'smtp_dialog',
  'total',
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * Percentiles from a set of samples, using nearest-rank.
 *
 * Nearest-rank rather than interpolation: an interpolated p99 reports a
 * latency no request actually experienced, which is misleading when the
 * question is "how slow is the slow case".
 */
export function percentiles(
  values: number[],
  ps: number[] = [50, 95, 99, 99.9],
): Record<string, number> {
  if (values.length === 0) return Object.fromEntries(ps.map((p) => [`p${p}`, NaN]));

  const sorted = [...values].sort((a, b) => a - b);
  const out: Record<string, number> = {};
  for (const p of ps) {
    // Nearest-rank: ceil(p/100 * N), clamped into the array.
    const rank = Math.ceil((p / 100) * sorted.length);
    const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
    out[`p${p}`] = sorted[index];
  }
  return out;
}

export interface StageReport {
  stage: Stage;
  count: number;
  min: number;
  max: number;
  percentiles: Record<string, number>;
}

export class Recorder {
  private samples = new Map<Stage, number[]>();
  private late = 0;

  /**
   * Record one stage measurement.
   *
   * `dueAt` is what makes this honest. In an open-loop benchmark a send is
   * scheduled for a fixed instant; if the harness is stalled — because the
   * system under test is stalled — the send starts late. Measuring from the
   * actual start time silently discards that queueing delay, so a system
   * that freezes for two seconds still reports a healthy p99. This is
   * coordinated omission, and it is why load tests routinely disagree with
   * production.
   *
   * Measuring from `dueAt` folds the stall back in, which is what a real
   * caller would have experienced.
   */
  record(stage: Stage, endedAt: number, dueAt: number, startedAt?: number): void {
    if (startedAt !== undefined && startedAt - dueAt > 1) this.late++;
    this.push(stage, endedAt - dueAt);
  }

  /** Record a stage duration that is genuinely independent of scheduling. */
  recordDuration(stage: Stage, ms: number): void {
    this.push(stage, ms);
  }

  private push(stage: Stage, value: number): void {
    const bucket = this.samples.get(stage);
    if (bucket) bucket.push(value);
    else this.samples.set(stage, [value]);
  }

  /** How many sends started later than scheduled, i.e. the harness fell behind. */
  get lateStarts(): number {
    return this.late;
  }

  count(stage: Stage): number {
    return this.samples.get(stage)?.length ?? 0;
  }

  report(): StageReport[] {
    const out: StageReport[] = [];
    for (const stage of STAGES) {
      const values = this.samples.get(stage);
      if (!values || values.length === 0) continue;
      out.push({
        stage,
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        percentiles: percentiles(values),
      });
    }
    return out;
  }
}

export interface Gate {
  p50: number;
  p99: number;
}

/** The spike's target, from the approved plan. */
export const SPIKE_GATE: Gate = { p50: 400, p99: 1000 };

/**
 * Whether a run meets the target. A function rather than a table a human
 * reads, so CI can fail on it.
 */
export function meetsGate(
  report: StageReport[],
  gate: Gate = SPIKE_GATE,
): { pass: boolean; reason?: string } {
  const total = report.find((r) => r.stage === 'total');
  if (!total) return { pass: false, reason: 'no total-stage samples recorded' };

  const p50 = total.percentiles['p50'];
  const p99 = total.percentiles['p99'];
  if (p50 > gate.p50) return { pass: false, reason: `p50 ${p50.toFixed(1)}ms exceeds ${gate.p50}ms` };
  if (p99 > gate.p99) return { pass: false, reason: `p99 ${p99.toFixed(1)}ms exceeds ${gate.p99}ms` };
  return { pass: true };
}

export function formatReport(report: StageReport[]): string {
  const head = ['stage', 'count', 'p50', 'p95', 'p99', 'p99.9', 'max'];
  const rows = report.map((r) => [
    r.stage,
    String(r.count),
    r.percentiles['p50'].toFixed(1),
    r.percentiles['p95'].toFixed(1),
    r.percentiles['p99'].toFixed(1),
    r.percentiles['p99.9'].toFixed(1),
    r.max.toFixed(1),
  ]);

  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');

  return [line(head), widths.map((w) => '─'.repeat(w)).join('  '), ...rows.map(line)].join('\n');
}

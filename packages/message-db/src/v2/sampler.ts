import type { DualWriteMessages } from './migration-mode';
import type { TenantScope } from './scope';

/**
 * Runs the two-store comparison on a fraction of live reads.
 *
 * `DualWriteMessages.compare()` is what turns "v2 looks fine" into a number,
 * but calling it on every read doubles the cost of the hot path. Sampling
 * gives the same answer for far less: a divergence severe enough to block the
 * cutover shows up in the first hundred comparisons, and one that appears in
 * a millionth of reads is not what stops a migration.
 *
 * Two properties matter more than the sampling itself:
 *
 * 1. **It never affects the response.** The comparison runs after the real
 *    read has been served, its result is discarded, and any error it raises
 *    is swallowed. A verification mechanism that can fail a customer's
 *    request is worse than no verification, because it will be the first
 *    thing switched off during an incident — usually permanently.
 *
 * 2. **It counts what it saw.** Sampling without recording the denominator
 *    produces "no divergences found", which is indistinguishable from "the
 *    sampler never ran".
 */
export interface SamplerStats {
  compared: number;
  matched: number;
  diverged: number;
  errored: number;
  /** Null until at least one comparison has completed. */
  divergenceRate: number | null;
}

export class ComparisonSampler {
  private compared = 0;
  private matched = 0;
  private diverged = 0;
  private errored = 0;

  /**
   * @param rate    Fraction of calls to compare, 0 to 1.
   * @param random  Injectable for tests; defaults to Math.random.
   */
  constructor(
    private rate: number,
    private random: () => number = Math.random,
  ) {
    if (rate < 0 || rate > 1) throw new Error('sample rate must be between 0 and 1');
  }

  /** Whether this call was selected. Exposed so callers can skip the work. */
  shouldSample(): boolean {
    if (this.rate === 0) return false;
    if (this.rate === 1) return true;
    return this.random() < this.rate;
  }

  /**
   * Compare if selected. Resolves once the comparison finishes, so a caller
   * that wants it off the response path should not await it.
   */
  async maybeCompare(
    store: DualWriteMessages,
    scope: TenantScope,
    options: { status?: string; limit?: number } = {},
  ): Promise<void> {
    if (!this.shouldSample()) return;

    try {
      const result = await store.compare(scope, options);
      this.compared++;
      if (result.matched) this.matched++;
      else this.diverged++;
    } catch {
      // A comparison that throws tells us nothing about whether the stores
      // agree, only that one was briefly unreachable. Counting it separately
      // keeps it out of the divergence rate, which is the number the cutover
      // decision rests on.
      this.errored++;
    }
  }

  stats(): SamplerStats {
    return {
      compared: this.compared,
      matched: this.matched,
      diverged: this.diverged,
      errored: this.errored,
      divergenceRate: this.compared === 0 ? null : this.diverged / this.compared,
    };
  }

  reset(): void {
    this.compared = 0;
    this.matched = 0;
    this.diverged = 0;
    this.errored = 0;
  }
}

/**
 * Whether the sample is large enough and clean enough to advance on.
 *
 * `minimumSamples` exists because a divergence rate of zero over three
 * comparisons is not evidence of anything. Requiring a floor turns "we saw no
 * problems" into "we looked hard enough to have seen them".
 */
export function readyToAdvance(
  stats: SamplerStats,
  minimumSamples = 1000,
): { ready: boolean; reason: string } {
  if (stats.compared < minimumSamples) {
    return {
      ready: false,
      reason: `only ${stats.compared} comparison(s); need ${minimumSamples} before the result means anything`,
    };
  }
  if (stats.diverged > 0) {
    return {
      ready: false,
      reason: `${stats.diverged} of ${stats.compared} comparisons diverged`,
    };
  }
  return { ready: true, reason: `${stats.compared} comparisons, no divergences` };
}

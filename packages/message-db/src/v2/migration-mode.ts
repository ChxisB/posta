import type { MessageRepository, MessageRow, NewMessage } from './messages';
import type { TenantScope } from './scope';

/**
 * The cutover switch.
 *
 * Moving a live message store is done in stages, because the only way to
 * discover that v2 disagrees with the legacy schema is to run both and
 * compare — and the only safe time to discover it is while the legacy schema
 * is still authoritative.
 *
 *   legacy   nothing changed. The escape hatch, available at every stage.
 *   dual     write both, read legacy. v2 is being populated and checked but
 *            cannot affect a customer.
 *   v2-read  write both, read v2. The dangerous step, and the reason `dual`
 *            comes first: if v2 is wrong this is when it shows, and legacy is
 *            still complete enough to fall back to.
 *   v2       write and read v2 only. Legacy is frozen, still present.
 *
 * Every transition is reversible except the last, and the last is only taken
 * once `v2-read` has run long enough to be boring. Dropping the legacy
 * schemas is a separate, manual act — deliberately not a mode.
 */
export type MigrationMode = 'legacy' | 'dual' | 'v2-read' | 'v2';

export function writesV2(mode: MigrationMode): boolean {
  return mode !== 'legacy';
}

export function writesLegacy(mode: MigrationMode): boolean {
  return mode !== 'v2';
}

export function readsV2(mode: MigrationMode): boolean {
  return mode === 'v2-read' || mode === 'v2';
}

/** The legacy store, narrowed to what this facade needs. */
export interface LegacyMessageStore {
  create(message: Record<string, unknown>): Promise<{ id: number }>;
  list(options?: { status?: string; limit?: number }): Promise<Array<Record<string, unknown>>>;
}

export interface Divergence {
  at: Date;
  operation: string;
  detail: string;
}

/**
 * Records where the two stores disagreed.
 *
 * Deliberately in-memory and bounded. This is a signal to a human during a
 * migration window, not an audit log: persisting it would mean a failing
 * secondary write also generates database writes, which is exactly the wrong
 * behaviour when the secondary is already unhealthy.
 */
export class DivergenceLog {
  private entries: Divergence[] = [];
  private dropped = 0;

  constructor(private limit = 100) {}

  record(operation: string, detail: string): void {
    if (this.entries.length >= this.limit) {
      // Keep the first occurrences, not the last. The first divergence after
      // a deploy is the diagnostic one; the ten-thousandth is the same fault
      // repeating.
      this.dropped++;
      return;
    }
    this.entries.push({ at: new Date(), operation, detail });
  }

  get all(): readonly Divergence[] {
    return this.entries;
  }

  get count(): number {
    return this.entries.length + this.dropped;
  }

  get healthy(): boolean {
    return this.count === 0;
  }

  clear(): void {
    this.entries = [];
    this.dropped = 0;
  }
}

/**
 * Writes to both stores, reads from whichever the mode designates.
 *
 * The asymmetry in error handling is the whole design:
 *
 *   - a failure in the **authoritative** store propagates, because the caller
 *     needs to know their message was not accepted
 *   - a failure in the **shadow** store is recorded and swallowed, because
 *     the message *was* accepted and throwing would turn a migration problem
 *     into lost mail
 *
 * Getting this backwards — letting a v2 write failure abort a send during
 * `dual` — would mean the migration could take production down while the new
 * store is not even being read yet.
 */
export class DualWriteMessages {
  constructor(
    private mode: MigrationMode,
    private legacy: LegacyMessageStore,
    private v2: MessageRepository,
    private divergence = new DivergenceLog(),
  ) {}

  get divergences(): DivergenceLog {
    return this.divergence;
  }

  async create(scope: TenantScope, message: NewMessage): Promise<{ id: string }> {
    const v2IsAuthoritative = this.mode === 'v2';

    let legacyId: number | undefined;
    if (writesLegacy(this.mode)) {
      legacyId = (await this.legacy.create(message as unknown as Record<string, unknown>)).id;
    }

    let v2Row: MessageRow | undefined;
    if (writesV2(this.mode)) {
      try {
        v2Row = await this.v2.create(scope, message);
      } catch (error) {
        if (v2IsAuthoritative) throw error;
        // Shadow write: the message is already accepted by the authoritative
        // store, so this is a migration defect, not a delivery failure.
        this.divergence.record(
          'create',
          `v2 write failed for ${message.rcpt_to}: ${(error as Error).message}`,
        );
      }
    }

    const id = v2IsAuthoritative ? v2Row?.id : String(legacyId ?? v2Row?.id ?? '');
    if (!id) throw new Error('message was not written to any store');
    return { id };
  }

  async list(
    scope: TenantScope,
    options: { status?: string; limit?: number } = {},
  ): Promise<Array<Record<string, unknown>>> {
    if (readsV2(this.mode)) {
      return this.v2.list(scope, options) as unknown as Promise<Array<Record<string, unknown>>>;
    }
    return this.legacy.list(options);
  }

  /**
   * Read both and compare counts, without either result reaching the caller.
   *
   * Run on a sample of requests during `dual`, this is what makes the cutover
   * a decision rather than a hope: it turns "v2 looks fine" into a number.
   * Counts only — comparing full rows would double the read cost on the hot
   * path, and a count mismatch is what a broken backfill actually looks like.
   */
  async compare(
    scope: TenantScope,
    options: { status?: string; limit?: number } = {},
  ): Promise<{ legacy: number; v2: number; matched: boolean }> {
    const [legacyRows, v2Rows] = await Promise.all([
      this.legacy.list(options),
      this.v2.list(scope, options),
    ]);

    const matched = legacyRows.length === v2Rows.length;
    if (!matched) {
      this.divergence.record(
        'compare',
        `legacy returned ${legacyRows.length} rows, v2 returned ${v2Rows.length}`,
      );
    }
    return { legacy: legacyRows.length, v2: v2Rows.length, matched };
  }
}

/**
 * Whether it is safe to advance from one mode to the next.
 *
 * Encoded rather than left to judgement, because the pressure to skip
 * `v2-read` and go straight to `v2` is highest exactly when the migration has
 * been dragging on and everyone wants it finished.
 */
export function canAdvance(
  from: MigrationMode,
  to: MigrationMode,
  divergences: DivergenceLog,
): { allowed: boolean; reason?: string } {
  const order: MigrationMode[] = ['legacy', 'dual', 'v2-read', 'v2'];
  const fromIndex = order.indexOf(from);
  const toIndex = order.indexOf(to);

  // Retreating is always allowed, and never gated on the divergence check.
  // The rollback path must not depend on the same conditions that gate
  // progress, or a bad deploy cannot be undone.
  if (toIndex <= fromIndex) return { allowed: true };

  if (toIndex - fromIndex > 1) {
    return {
      allowed: false,
      reason: `cannot skip from ${from} to ${to}: each stage exists to catch what the previous one cannot`,
    };
  }

  if (!divergences.healthy) {
    return {
      allowed: false,
      reason: `${divergences.count} divergence(s) recorded; resolve them before advancing`,
    };
  }

  return { allowed: true };
}

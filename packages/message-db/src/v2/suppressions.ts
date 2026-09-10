import type { Queryable } from '@posta/core';
import { and, insertColumns, tenantOnly, where, type TenantScope } from './scope';

/**
 * The suppression list.
 *
 * Different from every other repository here, in three ways that all follow
 * from one fact: this is checked before *every* send, and getting it wrong
 * destroys sender reputation rather than merely losing data.
 *
 * 1. Not partitioned by time. A suppression is current state, not an event.
 *    An address that hard-bounced last year is still suppressed today, and
 *    letting it age out of a partition would silently resume sending to a
 *    dead mailbox — precisely how a sending IP gets blocklisted.
 *
 * 2. Reads must be a single index probe. `isSuppressed` runs on the hot path,
 *    so its query is shaped to match `idx_suppressions_lookup` exactly:
 *    `(tenant_id, COALESCE(server_id, 0), lower(address))`. A query that
 *    diverges from that shape still returns the right answer, just via a scan
 *    — and a scan here costs latency on every message.
 *
 * 3. Failure is asymmetric, so the code is not symmetric either. Failing to
 *    suppress sends mail that damages reputation for months; suppressing in
 *    error delays one message. Everything ambiguous resolves toward
 *    suppressing.
 */

export interface SuppressionRow {
  id: string;
  tenant_id: string;
  server_id: string | null;
  address: string;
  reason: string;
  expires_at: Date | null;
  created_at: Date;
}

export type SuppressionReason = 'hard_bounce' | 'complaint' | 'unsubscribe' | 'manual' | string;

export class SuppressionRepository {
  constructor(private db: Queryable) {}

  /**
   * Whether this address may be sent to right now.
   *
   * Matches both a suppression on the scope's own server and a tenant-wide
   * one (`server_id IS NULL`), because a tenant-level complaint must stop
   * every server — the whole point of a tenant-wide entry is that it cannot
   * be escaped by sending from elsewhere.
   *
   * Returns the matching row rather than a boolean: the caller records *why*
   * a message was held, and "suppressed" without a reason is unactionable for
   * whoever picks up the support ticket.
   */
  async isSuppressed(scope: TenantScope, address: string): Promise<SuppressionRow | undefined> {
    // COALESCE mirrors the unique index expression exactly so the planner can
    // use it. `0` stands for "tenant-wide" because NULL never equals NULL.
    // tenantOnly, not the scope as given: where() would add `server_id = $2`
    // for a server-narrowed scope and exclude the tenant-wide rows this must
    // match. The server condition is expressed below instead, as an OR.
    const clause = and(
      where(tenantOnly(scope)),
      '(COALESCE(server_id, 0) = ? OR server_id IS NULL) AND lower(address) = lower(?)',
      scope.serverId ?? 0,
      address,
    );

    const rows = await this.db.query<SuppressionRow>(
      `SELECT * FROM suppressions
        WHERE ${clause.sql}
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY server_id NULLS FIRST
        LIMIT 1`,
      clause.params,
    );
    return rows[0];
  }

  /**
   * Add or refresh a suppression.
   *
   * Upsert rather than insert: the same address bouncing twice is the normal
   * case, not an error, and a unique-violation thrown from the bounce handler
   * would abort processing the rest of the batch.
   *
   * On conflict the reason is overwritten but the expiry is only ever widened
   * — NULL meaning permanent, coalesced to infinity for the comparison. A
   * transient soft-bounce arriving after a permanent hard-bounce must not
   * shorten the permanent one into something that expires.
   */
  async suppress(
    scope: TenantScope,
    address: string,
    reason: SuppressionReason,
    expiresAt?: Date,
  ): Promise<SuppressionRow> {
    // Column list is fixed here rather than derived, because ON CONFLICT
    // names the constraint's expression and must line up with it. The
    // tenant_id still comes from insertColumns, so there remains exactly one
    // place a row's tenant is decided.
    const scoped = insertColumns(scope);

    const rows = await this.db.query<SuppressionRow>(
      `INSERT INTO suppressions (tenant_id, server_id, address, reason, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, COALESCE(server_id, 0), lower(address))
       DO UPDATE SET
         reason = EXCLUDED.reason,
         expires_at = NULLIF(
           GREATEST(
             COALESCE(suppressions.expires_at, 'infinity'::timestamptz),
             COALESCE(EXCLUDED.expires_at, 'infinity'::timestamptz)
           ),
           'infinity'::timestamptz
         )
       RETURNING *`,
      [scoped.tenant_id, scoped.server_id ?? null, address, reason, expiresAt ?? null],
    );
    return rows[0];
  }

  /**
   * Remove a suppression, reporting whether anything matched.
   *
   * Exact server match only. A tenant-wide suppression is not removable by a
   * caller scoped to one server: it was set at the tenant level deliberately,
   * usually by a complaint, and letting one server lift it would defeat it.
   */
  async unsuppress(scope: TenantScope, address: string): Promise<boolean> {
    // Exact server match, so tenant-only scoping plus an explicit comparison:
    // a tenant-wide entry (server_id IS NULL) must not be removable here.
    const clause = and(
      where(tenantOnly(scope)),
      'COALESCE(server_id, 0) = ? AND lower(address) = lower(?)',
      scope.serverId ?? 0,
      address,
    );

    const rows = await this.db.query<{ id: string }>(
      `DELETE FROM suppressions WHERE ${clause.sql} RETURNING id`,
      clause.params,
    );
    return rows.length > 0;
  }

  /** Active suppressions, newest first. */
  async list(scope: TenantScope, limit = 100): Promise<SuppressionRow[]> {
    // Tenant-wide entries apply to every server, so they belong in a
    // server-scoped listing too.
    const clause = where(tenantOnly(scope));
    const bounded = Math.min(Math.max(limit, 1), 1000);

    return this.db.query<SuppressionRow>(
      `SELECT * FROM suppressions
        WHERE ${clause.sql}
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY created_at DESC
        LIMIT ${bounded}`,
      clause.params,
    );
  }

  /**
   * Delete entries whose expiry has passed.
   *
   * Only ever removes rows with a non-null `expires_at` in the past. A
   * permanent suppression has no expiry and can never be swept by this, which
   * is the property that matters: a bug here that deleted permanent entries
   * would resume sending to hard-bounced addresses en masse.
   */
  async pruneExpired(scope: TenantScope): Promise<number> {
    const clause = where(tenantOnly(scope));
    const rows = await this.db.query<{ id: string }>(
      `DELETE FROM suppressions
        WHERE ${clause.sql}
          AND expires_at IS NOT NULL
          AND expires_at <= now()
        RETURNING id`,
      clause.params,
    );
    return rows.length;
  }
}

import type { Queryable } from '@posta/core';
import { and, insertColumns, tenantOnly, where, type TenantScope } from './scope';

/**
 * Delivery attempts.
 *
 * One row per attempt, never updated. A message deferred fifteen times keeps
 * fifteen rows, because the question support is actually asked is "why is
 * this late", and that is answered by the sequence of remote replies, not by
 * the final state. Collapsing to a latest-status column would make the table
 * smaller and the product materially worse.
 */

export interface DeliveryRow {
  id: string;
  tenant_id: string;
  message_id: string;
  attempt: number;
  status: string;
  code: number | null;
  output: string | null;
  sent_with_ssl: boolean;
  duration_ms: number | null;
  created_at: Date;
}

export interface NewDelivery {
  message_id: string | number;
  attempt?: number;
  status: string;
  code?: number;
  /** The remote server's verbatim reply. Stored whole. */
  output?: string;
  sent_with_ssl?: boolean;
  duration_ms?: number;
}

export class DeliveryRepository {
  constructor(private db: Queryable) {}

  /** Append an attempt. */
  async record(scope: TenantScope, delivery: NewDelivery): Promise<DeliveryRow> {
    // Deliveries carry no server_id of their own — they inherit it from the
    // message. A server-narrowed scope would otherwise try to write a column
    // this table does not have, so only the tenant is taken.
    const { tenant_id } = insertColumns(scope);
    const {
      server_id: _s,
      tenant_id: _t,
      ...safe
    } = delivery as NewDelivery & Partial<Record<'tenant_id' | 'server_id', unknown>>;

    // Scope last, so a caller-supplied tenant_id cannot override it.
    const row = { ...safe, tenant_id };
    const columns = Object.keys(row);

    const rows = await this.db.query<DeliveryRow>(
      `INSERT INTO deliveries (${columns.join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING *`,
      Object.values(row),
    );
    return rows[0];
  }

  /**
   * Every attempt for one message, oldest first.
   *
   * Chronological rather than newest-first: this is read as a narrative —
   * accepted, deferred, deferred, delivered — and reversing it makes the
   * causal order harder to follow.
   */
  async forMessage(scope: TenantScope, messageId: string | number): Promise<DeliveryRow[]> {
    // tenantOnly: this table has no server_id column — a delivery inherits
    // its server from the message it belongs to. Passing the scope as given
    // would make where() emit `server_id = $2` and the query would fail with
    // "column server_id does not exist".
    const clause = and(where(tenantOnly(scope)), 'message_id = ?', messageId);
    return this.db.query<DeliveryRow>(
      `SELECT * FROM deliveries
        WHERE ${clause.sql}
        ORDER BY created_at ASC, attempt ASC`,
      clause.params,
    );
  }

  /** The most recent attempt, which is what a status column would have held. */
  async latestForMessage(
    scope: TenantScope,
    messageId: string | number,
  ): Promise<DeliveryRow | undefined> {
    const clause = and(where(tenantOnly(scope)), 'message_id = ?', messageId);
    const rows = await this.db.query<DeliveryRow>(
      `SELECT * FROM deliveries
        WHERE ${clause.sql}
        ORDER BY created_at DESC
        LIMIT 1`,
      clause.params,
    );
    return rows[0];
  }

  /**
   * Attempt counts by status over a window.
   *
   * The deferral rate this exposes is the number that actually predicts p99:
   * a rising share of 4xx means mail is being retried rather than delivered,
   * and no amount of pipelining or connection reuse recovers that.
   */
  async countByStatus(scope: TenantScope, since: Date): Promise<Record<string, number>> {
    const clause = and(where(tenantOnly(scope)), 'created_at >= ?', since);
    const rows = await this.db.query<{ status: string; count: string }>(
      `SELECT status, count(*)::text AS count
         FROM deliveries
        WHERE ${clause.sql}
        GROUP BY status`,
      clause.params,
    );
    // count(*) is a bigint and arrives as a string; see MessageRepository.
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  }
}

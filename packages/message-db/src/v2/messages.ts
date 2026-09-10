import type { Queryable } from '@posta/core';
import { and, insertColumns, where, type TenantScope } from './scope';

/**
 * Messages, in the unified store.
 *
 * Every method takes a `TenantScope` as its first argument. That is not a
 * convention — it is the only way to obtain a WHERE clause here, because
 * `where()` is the sole builder and it always emits the tenant predicate.
 *
 * There is deliberately no `findById(id)` overload without a scope: a bare
 * primary-key lookup is exactly the shape that leaks across tenants, since
 * ids are globally unique in v2 and a caller holding someone else's id would
 * otherwise get their message back.
 */

export interface MessageRow {
  id: string;
  tenant_id: string;
  server_id: string;
  token: string | null;
  scope: string;
  mail_from: string | null;
  rcpt_to: string;
  subject: string | null;
  message_id: string | null;
  status: string;
  held: boolean;
  size_bytes: string | null;
  body_key: string | null;
  spam: boolean;
  spam_score: number;
  bounce: boolean;
  tag: string | null;
  last_attempt_at: Date | null;
  created_at: Date;
}

export interface NewMessage {
  scope: string;
  rcpt_to: string;
  mail_from?: string;
  subject?: string;
  message_id?: string;
  token?: string;
  status?: string;
  body_key?: string;
  domain_id?: number;
  route_id?: number;
  credential_id?: number;
  tag?: string;
}

export interface ListOptions {
  status?: string;
  /** Only messages created at or after this instant. */
  since?: Date;
  limit?: number;
  /** Keyset cursor: the `created_at` of the last row of the previous page. */
  before?: Date;
}

/** Hard ceiling on a page, so a bad `limit` cannot scan a whole partition. */
const MAX_LIMIT = 500;

export class MessageRepository {
  constructor(private db: Queryable) {}

  /**
   * A page of messages, newest first.
   *
   * Keyset pagination on `created_at`, not OFFSET. At a billion rows a month
   * OFFSET 500000 makes Postgres walk and discard half a million rows on
   * every page — and it also skips or repeats rows when new mail arrives
   * mid-pagination, which for a message log is actively misleading.
   */
  async list(scope: TenantScope, options: ListOptions = {}): Promise<MessageRow[]> {
    let clause = where(scope);

    if (options.status) clause = and(clause, 'status = ?', options.status);
    if (options.since) clause = and(clause, 'created_at >= ?', options.since);
    if (options.before) clause = and(clause, 'created_at < ?', options.before);

    const limit = Math.min(Math.max(options.limit ?? 50, 1), MAX_LIMIT);

    return this.db.query<MessageRow>(
      `SELECT * FROM messages
        WHERE ${clause.sql}
        ORDER BY created_at DESC
        LIMIT ${limit}`,
      clause.params,
    );
  }

  /**
   * One message by id.
   *
   * `createdAt` is optional but worth passing: without it Postgres has no
   * partition-key predicate and must check every partition. With it, the scan
   * touches one month. The id alone is still correct, just slower — the right
   * default, since a caller following a link has the id and not necessarily
   * the date.
   */
  async find(
    scope: TenantScope,
    id: string | number,
    createdAt?: Date,
  ): Promise<MessageRow | undefined> {
    let clause = and(where(scope), 'id = ?', id);
    if (createdAt) clause = and(clause, 'created_at = ?', createdAt);

    const rows = await this.db.query<MessageRow>(
      `SELECT * FROM messages WHERE ${clause.sql} LIMIT 1`,
      clause.params,
    );
    return rows[0];
  }

  /** Insert, attributing the row to the scope's tenant and server. */
  async create(scope: TenantScope, message: NewMessage): Promise<MessageRow> {
    if (scope.serverId === undefined) {
      // A message belongs to exactly one server. A tenant-wide scope is
      // meaningful for reads but not for writes, and silently defaulting the
      // server would attach mail to the wrong one.
      throw new Error('create requires a scope narrowed to a server');
    }

    // Scope last, so it wins. The obvious spread — scope first, payload
    // second — lets a caller who controls `message` set their own tenant_id
    // and write into someone else's account. Any endpoint that forwards
    // user-supplied JSON here would be a privilege escalation.
    //
    // The keys are also stripped rather than merely overridden: leaving them
    // in the object and relying on precedence means the next person to
    // reorder these two lines reintroduces the hole silently.
    const { tenant_id: _t, server_id: _s, ...safe } = message as NewMessage &
      Partial<Record<'tenant_id' | 'server_id', unknown>>;
    const row = { ...safe, ...insertColumns(scope) };
    const columns = Object.keys(row);
    const placeholders = columns.map((_, i) => `$${i + 1}`);

    const rows = await this.db.query<MessageRow>(
      `INSERT INTO messages (${columns.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING *`,
      Object.values(row),
    );
    return rows[0];
  }

  /**
   * Move a message to a new status.
   *
   * Returns the updated row, or undefined when nothing matched — which is how
   * a caller learns the id belonged to another tenant. Reporting that as
   * "not found" rather than "forbidden" is deliberate: a distinguishable
   * error would let someone probe which ids exist elsewhere.
   */
  async updateStatus(
    scope: TenantScope,
    id: string | number,
    status: string,
  ): Promise<MessageRow | undefined> {
    const clause = and(where(scope), 'id = ?', id);
    const statusIndex = clause.nextIndex;

    const rows = await this.db.query<MessageRow>(
      `UPDATE messages
          SET status = $${statusIndex}, last_attempt_at = now()
        WHERE ${clause.sql}
        RETURNING *`,
      [...clause.params, status],
    );
    return rows[0];
  }

  /** Counts per status, for the dashboard tiles. */
  async countByStatus(scope: TenantScope, since?: Date): Promise<Record<string, number>> {
    let clause = where(scope);
    if (since) clause = and(clause, 'created_at >= ?', since);

    const rows = await this.db.query<{ status: string; count: string }>(
      `SELECT status, count(*)::text AS count
         FROM messages
        WHERE ${clause.sql}
        GROUP BY status`,
      clause.params,
    );

    // count(*) comes back as a string: a Postgres bigint exceeds JS's safe
    // integer range, so the driver refuses to guess. These counts are small
    // enough to convert, but the raw value is a string, and code assuming
    // otherwise compares "2" against 2 and quietly fails — which is exactly
    // the pre-existing bug in the core integration tests.
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  }
}

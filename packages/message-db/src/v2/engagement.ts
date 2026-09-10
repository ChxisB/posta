import type { Queryable } from '@posta/core';
import { and, insertColumns, tenantOnly, where, type TenantScope } from './scope';

/**
 * Link tracking, clicks and opens.
 *
 * One repository for three tables because they are one feature: a link is
 * rewritten at send time, a click resolves that link, and an open is the same
 * mechanism with a pixel instead of an anchor. Splitting them would mean
 * three near-identical files and a caller that has to know which to reach for.
 *
 * Everything here is recorded from a public HTTP endpoint — the tracking
 * domain — which is the one place in the system where an untrusted request
 * causes a database write. That shapes two decisions below: token lookup is
 * the only unauthenticated entry point, and it still runs through the tenant
 * scope rather than trusting the token alone.
 */

export interface LinkRow {
  id: string;
  tenant_id: string;
  message_id: string;
  token: string;
  url: string;
  created_at: Date;
}

export interface EngagementRow {
  id: string;
  tenant_id: string;
  message_id: string;
  link_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

export interface NewLink {
  message_id: string | number;
  token: string;
  url: string;
}

export interface NewEngagement {
  message_id: string | number;
  link_id?: string | number;
  ip_address?: string;
  user_agent?: string;
}

export class EngagementRepository {
  constructor(private db: Queryable) {}

  /** Register a rewritten link at send time. */
  async createLink(scope: TenantScope, link: NewLink): Promise<LinkRow> {
    const row = { ...stripScopeKeys(link), tenant_id: insertColumns(scope).tenant_id };
    const columns = Object.keys(row);

    const rows = await this.db.query<LinkRow>(
      `INSERT INTO links (${columns.join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING *`,
      Object.values(row),
    );
    return rows[0];
  }

  /**
   * Resolve a tracking token to its link.
   *
   * Still tenant-scoped, even though the token is unguessable and would be
   * sufficient on its own. Two reasons: a token collision across tenants
   * becomes a non-event rather than a cross-account disclosure, and keeping
   * every method scoped leaves the guard no exception to carve out — an
   * exception is what the next unscoped method would cite as precedent.
   */
  async findByToken(scope: TenantScope, token: string): Promise<LinkRow | undefined> {
    // See deliveries.ts: links carry no server_id either.
    const clause = and(where(tenantOnly(scope)), 'token = ?', token);
    const rows = await this.db.query<LinkRow>(
      `SELECT * FROM links WHERE ${clause.sql} LIMIT 1`,
      clause.params,
    );
    return rows[0];
  }

  async recordClick(scope: TenantScope, click: NewEngagement): Promise<EngagementRow> {
    return this.insertEngagement(scope, 'clicks', click);
  }

  async recordLoad(scope: TenantScope, load: NewEngagement): Promise<EngagementRow> {
    return this.insertEngagement(scope, 'loads', load);
  }

  /** Clicks and opens for one message, oldest first. */
  async forMessage(
    scope: TenantScope,
    messageId: string | number,
  ): Promise<{ clicks: EngagementRow[]; loads: EngagementRow[] }> {
    const clause = and(where(tenantOnly(scope)), 'message_id = ?', messageId);

    const [clicks, loads] = await Promise.all([
      this.db.query<EngagementRow>(
        `SELECT * FROM clicks WHERE ${clause.sql} ORDER BY created_at ASC`,
        clause.params,
      ),
      this.db.query<EngagementRow>(
        `SELECT * FROM loads WHERE ${clause.sql} ORDER BY created_at ASC`,
        clause.params,
      ),
    ]);

    return { clicks, loads };
  }

  /**
   * Shared insert for the two engagement tables.
   *
   * `table` is a private literal union, never a caller-supplied string, so
   * interpolating it into the SQL cannot become injection. The alternative —
   * two near-identical public methods — is what this avoids.
   */
  private async insertEngagement(
    scope: TenantScope,
    table: 'clicks' | 'loads',
    event: NewEngagement,
  ): Promise<EngagementRow> {
    const row = { ...stripScopeKeys(event), tenant_id: insertColumns(scope).tenant_id };
    const columns = Object.keys(row);

    const rows = await this.db.query<EngagementRow>(
      `INSERT INTO ${table} (${columns.join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING *`,
      Object.values(row),
    );
    return rows[0];
  }
}

/**
 * Remove any scope columns a caller supplied.
 *
 * These records originate from public HTTP requests, so the payload is
 * genuinely attacker-controlled: without this, a crafted tracking request
 * could attribute a click to another tenant's message.
 */
function stripScopeKeys<T extends object>(input: T): Omit<T, 'tenant_id' | 'server_id'> {
  const {
    tenant_id: _t,
    server_id: _s,
    ...rest
  } = input as T & Partial<Record<'tenant_id' | 'server_id', unknown>>;
  return rest as Omit<T, 'tenant_id' | 'server_id'>;
}

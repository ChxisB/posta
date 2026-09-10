/**
 * Tenant scoping for the unified message store.
 *
 * Under the old model isolation was physical: each server had its own
 * Postgres schema, so a query simply could not see another tenant's rows.
 * That property is what the v2 schema gives up in exchange for scaling, and
 * nothing replaces it automatically — every row of every table now sits next
 * to every other tenant's.
 *
 * So isolation has to be reconstructed in the type system, because the
 * alternative is relying on each of several hundred future queries
 * remembering to add `AND tenant_id = $n`. One that forgets does not fail, or
 * error, or look wrong in review: it silently returns another customer's
 * mail. That is the worst bug this codebase could ship, and it is invisible
 * in testing unless you happen to have two tenants with data.
 *
 * The design makes the unsafe version unrepresentable:
 *
 *   - `TenantScope` is branded, so a bare number cannot be passed as one
 *   - it can only be produced by `scopeFor`, which validates
 *   - `where()` always emits the tenant predicate first, and callers append
 *     to what it returns rather than composing a WHERE clause themselves
 *
 * A repository method that wants to skip scoping has to go out of its way,
 * visibly.
 */

declare const brand: unique symbol;

/**
 * A validated tenant identity. Branded so `scopeFor(1)` and a stray `1` are
 * different types: passing a raw number where a scope is expected is a
 * compile error rather than a silent cross-tenant read.
 */
export interface TenantScope {
  readonly tenantId: number;
  /** Narrows to one mail server. Omitted means all servers for the tenant. */
  readonly serverId?: number;
  readonly [brand]: 'TenantScope';
}

export class InvalidScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidScopeError';
  }
}

/**
 * Build a scope, rejecting anything that is not a usable tenant id.
 *
 * The rejected values matter more than they look. `0`, `NaN` and `undefined`
 * are what a missing session, a failed parse, or an unauthenticated request
 * produce — and `tenant_id = NaN` or a coerced `0` would either error deep in
 * the driver or, worse, match nothing and read as "this tenant has no data".
 * Failing here means the caller learns immediately, at the boundary.
 */
export function scopeFor(tenantId: number, serverId?: number): TenantScope {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new InvalidScopeError(
      `tenantId must be a positive integer, received ${JSON.stringify(tenantId)}`,
    );
  }
  if (serverId !== undefined && (!Number.isInteger(serverId) || serverId <= 0)) {
    throw new InvalidScopeError(
      `serverId must be a positive integer when given, received ${JSON.stringify(serverId)}`,
    );
  }
  return { tenantId, serverId } as TenantScope;
}

/**
 * Widen a scope to its tenant, dropping any server narrowing.
 *
 * Needed wherever a row may be attributed to the whole tenant rather than to
 * one server — suppressions being the case that matters, since a spam
 * complaint is recorded tenant-wide precisely so no server can escape it.
 *
 * Without this, `where()` on a server-narrowed scope emits `server_id = $2`,
 * which excludes the `server_id IS NULL` rows entirely: the tenant-wide
 * suppression silently stops applying and the complained-about address starts
 * receiving mail again.
 */
export function tenantOnly(scope: TenantScope): TenantScope {
  return { tenantId: scope.tenantId } as TenantScope;
}

export interface ScopedWhere {
  /** SQL fragment, without the `WHERE` keyword. */
  sql: string;
  params: unknown[];
  /** Next positional placeholder index, for callers appending conditions. */
  nextIndex: number;
}

/**
 * Start a WHERE clause that is already tenant-scoped.
 *
 * Always emits `tenant_id = $1` first — matching the leading column of every
 * index in the v2 schema, so the scoping predicate is also the one that makes
 * the query fast. Isolation and performance point the same way, which is
 * deliberate: an isolation mechanism that costs latency gets removed.
 */
export function where(scope: TenantScope, alias?: string): ScopedWhere {
  const prefix = alias ? `${alias}.` : '';
  const params: unknown[] = [scope.tenantId];
  let sql = `${prefix}tenant_id = $1`;

  if (scope.serverId !== undefined) {
    params.push(scope.serverId);
    sql += ` AND ${prefix}server_id = $2`;
  }

  return { sql, params, nextIndex: params.length + 1 };
}

/**
 * Append a condition to a scoped WHERE, keeping placeholder numbering right.
 *
 * Exists so callers never hand-number `$3`, `$4`… A mis-numbered placeholder
 * shifts every parameter after it, which can move a value into the tenant
 * position — turning a numbering slip into a cross-tenant read.
 */
export function and(base: ScopedWhere, fragment: string, ...values: unknown[]): ScopedWhere {
  let index = base.nextIndex;
  // `?` in the fragment is replaced left-to-right with the next placeholder.
  const sql = fragment.replace(/\?/g, () => `$${index++}`);

  if (index - base.nextIndex !== values.length) {
    throw new InvalidScopeError(
      `fragment has ${index - base.nextIndex} placeholder(s) but ${values.length} value(s) were given: ${fragment}`,
    );
  }

  return {
    sql: `${base.sql} AND ${sql}`,
    params: [...base.params, ...values],
    nextIndex: index,
  };
}

/**
 * Values every insert must carry, so a row cannot be written unattributed.
 *
 * An unscoped INSERT is the mirror of an unscoped SELECT: the row lands with
 * a null or zero tenant_id and becomes either invisible or visible to
 * everyone, depending on how the next query is written.
 */
export function insertColumns(scope: TenantScope): { tenant_id: number; server_id?: number } {
  return scope.serverId === undefined
    ? { tenant_id: scope.tenantId }
    : { tenant_id: scope.tenantId, server_id: scope.serverId };
}

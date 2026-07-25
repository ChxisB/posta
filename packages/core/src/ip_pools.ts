import type { Database } from 'bun:sqlite';

export interface PoolRule {
  id?: number;
  uuid?: string;
  owner_type: string;
  owner_id: number;
  ip_pool_id: number;
  from_text: string | null;
  to_text: string | null;
}

export interface MessageContext {
  scope?: string;
  rcpt_to?: string;
  mail_from?: string;
  domain_id?: number;
}

/**
 * Allocate an IP address for an outgoing message.
 * Returns the ip_address_id or null if no pool matches.
 */
export function allocateIpAddress(
  db: Database,
  useIpPools: boolean,
  serverId: number,
  scope: string,
  rcptTo: string,
): number | null {
  if (!useIpPools) return null;
  if (scope !== 'outgoing') return null;
  if (!rcptTo) return null;

  const poolId = ipPoolForMessage(db, serverId, rcptTo);
  if (!poolId) return null;

  return selectIpAddressByPriority(db, poolId);
}

/**
 * Resolve which IP pool to use for a message.
 * Server rules (newest first) → Org rules (newest first) → server.ip_pool_id fallback.
 */
function ipPoolForMessage(db: Database, serverId: number, rcptTo: string): number | null {
  const server = db.query(
    `SELECT organization_id, ip_pool_id FROM servers WHERE id = ?`,
  ).get(serverId) as { organization_id: number; ip_pool_id: number | null } | undefined;
  if (!server) return null;

  const recipientDomain = rcptTo.split('@')[1] ?? '';

  // 1. Server-scoped rules (newest first)
  const serverRules = db.query(
    `SELECT * FROM ip_pool_rules WHERE owner_type = 'Server' AND owner_id = ? ORDER BY created_at DESC`,
  ).all(serverId) as PoolRule[];
  for (const rule of serverRules) {
    if (applyToMessage(rule, rcptTo, recipientDomain)) {
      return rule.ip_pool_id;
    }
  }

  // 2. Org-scoped rules (newest first)
  const orgRules = db.query(
    `SELECT * FROM ip_pool_rules WHERE owner_type = 'Organization' AND owner_id = ? ORDER BY created_at DESC`,
  ).all(server.organization_id) as PoolRule[];
  for (const rule of orgRules) {
    if (applyToMessage(rule, rcptTo, recipientDomain)) {
      return rule.ip_pool_id;
    }
  }

  // 3. Server's direct pool (fallback)
  return server.ip_pool_id ?? null;
}

/**
 * Check if a rule applies to the given message.
 */
function applyToMessage(rule: PoolRule, rcptTo: string, recipientDomain: string): boolean {
  // Check `to_text` against rcpt_to
  if (rule.to_text) {
    const conditions = rule.to_text.split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const condition of conditions) {
      if (addressMatches(condition, rcptTo)) return true;
    }
  }

  // Check `from_text` against the recipient domain
  // (simplified: uses domain instead of full From header parsing)
  if (rule.from_text) {
    const conditions = rule.from_text.split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const condition of conditions) {
      if (addressMatches(condition, `${rule.owner_id}@${recipientDomain}`)) return true;
    }
  }

  return false;
}

/**
 * Match a condition against an email address.
 * If condition contains '@', match is exact (after stripping +suffix).
 * Otherwise, match against the domain part.
 */
function addressMatches(condition: string, address: string): boolean {
  const addrParts = address.split('@');
  const domain = addrParts.slice(1).join('@');
  const localPart = addrParts[0] ?? '';

  if (condition.includes('@')) {
    const condParts = condition.split('@');
    const condDomain = condParts.slice(1).join('@');
    const condLocal = condParts[0] ?? '';

    if (condDomain !== domain) return false;

    const strippedLocal = localPart.includes('+') ? localPart.split('+')[0] : localPart;
    return strippedLocal === condLocal;
  }

  return condition === domain;
}

/**
 * Select an IP address from a pool using weighted random selection.
 * Higher priority = higher probability.
 */
function selectIpAddressByPriority(db: Database, poolId: number): number | null {
  const row = db.query(
    `SELECT id FROM ip_addresses
     WHERE ip_pool_id = ?
     ORDER BY (ABS(RANDOM()) / 9223372036854775807.0) * COALESCE(priority, 100) DESC
     LIMIT 1`,
  ).get(poolId) as { id: number } | undefined;
  return row?.id ?? null;
}

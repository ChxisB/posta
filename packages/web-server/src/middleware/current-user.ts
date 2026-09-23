import { createClerkClient } from '@clerk/backend';
import { Elysia } from 'elysia';
import type { Queryable } from '@posta/core';

/** The Posta account behind a signed-in Clerk session. */
export interface CurrentUser {
  id: number;
  admin: boolean;
  email_address: string | null;
  first_name: string | null;
  last_name: string | null;
}

/** The parts of a Clerk user that provisioning needs. */
export interface ClerkProfile {
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
}

export type ProfileLoader = (clerkUserId: string) => Promise<ClerkProfile>;

const COLUMNS = 'id, admin, email_address, first_name, last_name';

// Arbitrary constant ("posta" in ASCII). Held for the length of the
// provisioning transaction so two first sign-ins racing on an empty install
// cannot both become the administrator.
const PROVISION_LOCK = 482131465313;

function toUser(row: any): CurrentUser {
  return {
    id: Number(row.id),
    admin: Number(row.admin) !== 0,
    email_address: row.email_address ?? null,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
  };
}

/**
 * Map a Clerk user onto a Posta account, creating or linking one if needed.
 *
 * Clerk proves who someone is; this decides whether they have access:
 *
 *   - an account already linked to this Clerk user is returned as-is
 *   - on an installation with no administrator, the first person to sign in
 *     becomes one, so the admin account is created simply by signing up
 *   - otherwise an account an admin created for a matching, verified email
 *     address is linked to the Clerk user on their first sign-in
 *   - anyone else gets null: a Clerk account alone grants nothing
 */
export async function resolveUser(
  db: Queryable,
  clerkUserId: string,
  loadProfile: ProfileLoader,
): Promise<CurrentUser | null> {
  const row = await db.get<any>(
    `SELECT ${COLUMNS}, EXISTS (SELECT 1 FROM users WHERE admin <> 0) AS admin_exists
     FROM users WHERE oidc_uid = $1 LIMIT 1`,
    [clerkUserId],
  );
  if (row && row.admin_exists) return toUser(row);

  // Fetched before the transaction so the lock isn't held across a network call.
  const profile = row ? null : await loadProfile(clerkUserId);

  return db.transaction(async (tx) => {
    await tx.query(`SELECT pg_advisory_xact_lock(${PROVISION_LOCK})`);

    const adminExists = !!(await tx.get(`SELECT 1 AS one FROM users WHERE admin <> 0 LIMIT 1`));
    let user = await tx.get<any>(
      `SELECT ${COLUMNS} FROM users WHERE oidc_uid = $1 LIMIT 1`,
      [clerkUserId],
    );

    if (!user && profile?.email && profile.emailVerified) {
      user = await tx.get<any>(
        `UPDATE users
         SET oidc_uid = $1, oidc_issuer = 'clerk',
             first_name = COALESCE(first_name, $2), last_name = COALESCE(last_name, $3),
             updated_at = NOW()
         WHERE id = (
           SELECT id FROM users
           WHERE lower(email_address) = lower($4) AND oidc_uid IS NULL
           ORDER BY id LIMIT 1
         )
         RETURNING ${COLUMNS}`,
        [clerkUserId, profile.firstName, profile.lastName, profile.email],
      );
    }

    if (!user) {
      if (adminExists) return null;
      user = await tx.get<any>(
        `INSERT INTO users (uuid, first_name, last_name, email_address, admin, oidc_uid, oidc_issuer, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 1, $5, 'clerk', NOW(), NOW())
         RETURNING ${COLUMNS}`,
        [
          crypto.randomUUID().replace(/-/g, ''),
          profile?.firstName ?? null,
          profile?.lastName ?? null,
          profile?.email ?? null,
          clerkUserId,
        ],
      );
    } else if (!adminExists) {
      // An installation upgraded from a version without first-run setup can
      // have accounts but no administrator. The first of them to sign in
      // takes the role rather than leaving everyone locked out of admin pages.
      user = await tx.get<any>(
        `UPDATE users SET admin = 1, updated_at = NOW() WHERE id = $1 RETURNING ${COLUMNS}`,
        [user.id],
      );
    }

    return toUser(user);
  });
}

let clerkClient: ReturnType<typeof createClerkClient> | null = null;

async function loadClerkProfile(clerkUserId: string): Promise<ClerkProfile> {
  clerkClient ??= createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const u = await clerkClient.users.getUser(clerkUserId);
  const primary = u.primaryEmailAddress ?? u.emailAddresses[0] ?? null;
  return {
    email: primary?.emailAddress ?? null,
    emailVerified: primary?.verification?.status === 'verified',
    firstName: u.firstName,
    lastName: u.lastName,
  };
}

/**
 * Resolve `c.user` for the signed-in Clerk user. Use after .use(clerkAuth).
 * `c.userError` is set when the account couldn't be looked up at all, so the
 * guard can answer 503 rather than a misleading 403.
 */
export const currentUser = new Elysia().derive({ as: 'scoped' }, async (c: any) => {
  if (!c.clerk?.authenticated || !c.clerk.userId) {
    return { user: null as CurrentUser | null, userError: null as string | null };
  }
  try {
    const { getDb } = await import('../index');
    const db = await getDb();
    return { user: await resolveUser(db, c.clerk.userId, loadClerkProfile), userError: null };
  } catch (err: any) {
    console.error('[web-server] could not resolve the signed-in user:', err);
    return { user: null, userError: `Could not load your account: ${err?.message ?? 'unknown error'}` };
  }
});

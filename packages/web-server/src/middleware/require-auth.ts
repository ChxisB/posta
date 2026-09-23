import { Elysia } from 'elysia';

/**
 * Require a signed-in, provisioned user on Web UI API routes.
 * Use after .use(clerkAuth).use(currentUser).
 *
 * Scoped, not local: a local hook only covers routes registered on this
 * plugin — which has none — so every dashboard route the app registers after
 * it was previously served without authentication.
 */
export const requireClerkAuth = new Elysia()
  .onBeforeHandle({ as: 'scoped' }, (c: any) => {
    if (!c.clerk?.authenticated) {
      c.set.status = 401;
      return { error: 'Unauthorized', message: c.clerk?.error ?? 'Authentication required' };
    }
    if (c.userError) {
      c.set.status = 503;
      return { error: 'AccountUnavailable', message: c.userError };
    }
    if (!c.user) {
      c.set.status = 403;
      return {
        error: 'NotProvisioned',
        message: 'This account has not been added to this Posta installation. '
          + 'Ask an administrator to add your email address under Administration → Users.',
      };
    }
  });

/** Route-level guard for administrator-only routes. Use as `beforeHandle`. */
export function requireAdmin(c: any) {
  if (!c.user?.admin) {
    c.set.status = 403;
    return { error: 'AdminRequired', message: 'Only an administrator can do this.' };
  }
}

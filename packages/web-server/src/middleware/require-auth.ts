import { Elysia } from 'elysia';

/**
 * Require Clerk authentication on Web UI API routes.
 * Use after .use(clerkAuth).
 */
export const requireClerkAuth = new Elysia()
  .onBeforeHandle((c: any) => {
    if (!c.clerk?.authenticated) {
      c.set.status = 401;
      c.set.headers = { 'Content-Type': 'application/json' };
      return { error: 'Unauthorized', message: c.clerk?.error ?? 'Authentication required' };
    }
  });

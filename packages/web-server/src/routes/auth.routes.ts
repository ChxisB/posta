import { Elysia } from 'elysia';

/**
 * Public: whether this installation has an administrator yet. The landing and
 * sign-up pages use it to tell a brand-new install ("create the admin
 * account") from one people are joining ("sign in").
 */
export const setupStatusRoutes = new Elysia()
  .get('/setup/status', async () => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const row = await db.get<{ admin_exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM users WHERE admin <> 0) AS admin_exists`,
    );
    return { admin_exists: !!row?.admin_exists };
  }, { detail: { tags: ['Auth'], summary: 'First-run setup status' } });

/** The signed-in user's Posta account. Registered behind requireClerkAuth. */
export const authRoutes = new Elysia()
  .get('/me', (c: any) => ({ user: c.user }), {
    detail: { tags: ['Auth'], summary: 'The signed-in user' },
  });

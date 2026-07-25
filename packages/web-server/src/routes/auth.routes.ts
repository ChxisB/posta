import { Elysia, t } from 'elysia';

export const authRoutes = new Elysia()

  .post('/login', (c: any) => {
    c.set.status = 200;
    return { success: true, message: 'Use Clerk for authentication' };
  }, {
    body: t.Object({ email: t.String(), password: t.String() }),
    detail: { tags: ['Auth'], summary: 'Login (use Clerk)' },
  })

  .post('/logout', (c: any) => {
    c.set.status = 200;
    return { success: true };
  }, { detail: { tags: ['Auth'], summary: 'Logout (use Clerk)' } });

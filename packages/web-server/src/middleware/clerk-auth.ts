import { verifyToken } from '@clerk/backend';
import { Elysia } from 'elysia';

export const clerkAuth = new Elysia().derive(
  { as: 'scoped' },
  async (c: any) => {
    const authHeader = c.request.headers.get('Authorization');
    const cookieHeader = c.request.headers.get('Cookie') ?? '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').filter(Boolean).map((kv: string) => {
        const [k, ...v] = kv.trim().split('=');
        return [k, v.join('=')];
      }),
    );
    const sessionCookie = cookies['__session'];

    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : sessionCookie;

    if (!token) {
      return {
        clerk: {
          authenticated: false as const,
          userId: null as string | null,
          error: 'Missing Authorization header or __session cookie',
        },
      };
    }

    try {
      const verified = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY ?? '',
        jwtKey: process.env.CLERK_JWT_KEY,
        authorizedParties: [
          `http://localhost:${process.env.PORT ?? '5001'}`,
          'http://localhost:3000',
          process.env.POSTA_WEB_URL,
        ].filter(Boolean) as string[],
      });

      const payload = verified.payload as any;

      return {
        clerk: {
          authenticated: true as const,
          userId: payload.sub ?? '',
          orgId: payload.org_id ?? null,
          error: null as string | null,
        },
      };
    } catch (err: any) {
      c.set.status = 401;
      return {
        clerk: {
          authenticated: false as const,
          userId: null as string | null,
          orgId: null as string | null,
          error: `Authentication failed: ${err.message ?? 'Invalid token'}`,
        },
      };
    }
  },
);

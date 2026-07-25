import { Elysia } from 'elysia';

const AUTH_HEADERS = ['x-server-api-key', 'x-api-key'];

export interface ApiAuthResult {
  authenticated: boolean;
  credential?: any;
  server?: any;
  error?: string;
  errorCode?: string;
}

export const apiAuth = new Elysia().derive(
  { as: 'scoped' },
  async (c: any): Promise<{ auth: ApiAuthResult }> => {
    const auth = await authenticateRequest(c);
    return { auth };
  },
);

export const requireApiAuth = new Elysia()
  .onBeforeHandle({ as: 'scoped' }, async (c: any) => {
    if (!c.auth?.authenticated) {
      c.set.status = 200;
      return {
        status: 'error',
        time: 0,
        flags: {},
        data: {
          code: c.auth?.errorCode ?? 'AccessDenied',
          message: c.auth?.error ?? 'Must be authenticated as a server with an API key.',
          ...(c.auth?.errorCode === 'InvalidServerAPIKey' ? { token: c.request.headers.get('x-server-api-key') || c.request.headers.get('x-api-key') } : {}),
        },
      };
    }
  });

async function getHeaderValue(c: any): Promise<string | null> {
  for (const name of AUTH_HEADERS) {
    const val = c.request.headers.get(name);
    if (val) return val;
  }
  return null;
}

async function authenticateRequest(c: any): Promise<ApiAuthResult> {
  const apiKey = await getHeaderValue(c);
  if (!apiKey) {
    return { authenticated: false, errorCode: 'AccessDenied', error: 'Must be authenticated as a server.' };
  }

  try {
    const { getDb } = await import('../index');
    const db = getDb();

    const credential = db.query(
      `SELECT * FROM credentials WHERE type = 'API' AND key = ? LIMIT 1`,
    ).get(apiKey) as any;

    if (!credential) {
      return {
        authenticated: false,
        errorCode: 'InvalidServerAPIKey',
        error: 'The API token provided in X-Server-API-Key was not valid.',
      };
    }

    const server = db.query(`SELECT * FROM servers WHERE id = ?`).get(credential.server_id) as any;
    if (!server) {
      return {
        authenticated: false,
        errorCode: 'InvalidServerAPIKey',
        error: 'The server associated with this API key no longer exists.',
      };
    }

    if (server.suspended_at) {
      return {
        authenticated: false,
        errorCode: 'ServerSuspended',
        error: 'The server has been suspended.',
      };
    }

    const org = db.query(`SELECT suspended_at FROM organizations WHERE id = ?`).get(server.organization_id) as any;
    if (org?.suspended_at) {
      return {
        authenticated: false,
        errorCode: 'ServerSuspended',
        error: 'The organization has been suspended.',
      };
    }

    db.run(`UPDATE credentials SET last_used_at = datetime('now') WHERE id = ?`, [credential.id]);

    return {
      authenticated: true,
      credential,
      server,
    };
  } catch (err: any) {
    console.error('[api-auth] error:', err.message);
    return {
      authenticated: false,
      errorCode: 'AccessDenied',
      error: 'Authentication error.',
    };
  }
}

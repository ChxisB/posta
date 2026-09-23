import { Elysia } from 'elysia';
import type { PostaConfig, PgClient } from '@posta/core';
import { loadConfig, initializeMainDb } from '@posta/core';
import type { MessageDbProvisioner } from '@posta/message-db';
import { MessageStore } from '@posta/message-db';
import { sendRoutes } from './routes/api/v1/send.routes';
import { messagesRoutes } from './routes/api/v1/messages.routes';
import { apiAuth, requireApiAuth } from './middleware/api-auth';
import { clerkAuth } from './middleware/clerk-auth';
import { currentUser } from './middleware/current-user';
import { requireClerkAuth } from './middleware/require-auth';
import { serverRoutes, credentialRoutes } from './routes/org/servers.routes';
import { domainRoutes } from './routes/org/domains.routes';
import { routeRoutes } from './routes/org/routes.routes';
import { endpointRoutes } from './routes/org/endpoints.routes';
import { webhookRoutes } from './routes/org/webhooks.routes';
import { messageRoutes } from './routes/org/messages.routes';
import { trackDomainsRoutes } from './routes/org/track_domains.routes';
import { serverIpPoolRuleRoutes, orgIpPoolRuleRoutes } from './routes/org/ip_pool_rules.routes';
import { organizationRoutes } from './routes/organizations.routes';
import { userRoutes } from './routes/users.routes';
import { ipPoolRoutes } from './routes/ip_pools.routes';
import { orgSettingsRoutes } from './routes/org/organization-settings.routes';
import { wellKnownRoutes } from './routes/well-known.routes';
import { settingsRoutes } from './routes/settings.routes';
import { authRoutes, setupStatusRoutes } from './routes/auth.routes';

// Lazy initialization — config is loaded when init() is called
let config: PostaConfig;
let provisioner: MessageDbProvisioner;
let db: PgClient;
let initPromise: Promise<void> | null = null;

async function initAsync(): Promise<void> {
  if (config) return;
  config = loadConfig();
  db = await initializeMainDb(config);
  const { MessageDbProvisioner: MDP } = await import('@posta/message-db');
  provisioner = new MDP(config);
}

function init(): Promise<void> {
  if (!initPromise) initPromise = initAsync();
  return initPromise;
}

export async function getDb() { await init(); return db; }
export async function getConfig() { await init(); return config; }
export async function getProvisioner() { await init(); return provisioner; }
export { MessageStore };

const PORT = parseInt(process.env.PORT ?? '5001', 10);
const startedAt = Date.now();

export const app = new Elysia()
  .onRequest((c: any) => {
    c.set.headers ??= {};
    c.set.headers['Access-Control-Allow-Origin'] = '*';
    c.set.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
    c.set.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Server-API-Key, X-API-Key';
    c.set.headers['Access-Control-Allow-Credentials'] = 'true';
    if (c.request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }
  })
  .get('/health', () => ({
    status: 'healthy',
    service: 'web-server',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
  }))
  .get('/ready', () => ({ ready: true }))
  .get('/ip', (c: any) => {
    const ip = c.request.headers.get('x-forwarded-for')
      ?? c.request.headers.get('x-real-ip')
      ?? '';
    return { ip };
  })

  .use(wellKnownRoutes)
  .use(setupStatusRoutes)
  .use(apiAuth)
  .use(sendRoutes)
  .use(messagesRoutes)
  // Web UI API routes: everything registered below needs a signed-in Clerk
  // user with a Posta account (see middleware/current-user.ts).
  .use(clerkAuth)
  .use(currentUser)
  .use(requireClerkAuth)

  .use(serverRoutes)
  .use(credentialRoutes)
  .use(domainRoutes)
  .use(routeRoutes)
  .use(endpointRoutes)
  .use(webhookRoutes)
  .use(messageRoutes)
  .use(trackDomainsRoutes)
  .use(serverIpPoolRuleRoutes)

  .use(organizationRoutes)
  .use(orgIpPoolRuleRoutes)
  .use(orgSettingsRoutes)
  .use(userRoutes)
  .use(ipPoolRoutes)
  .use(settingsRoutes)
  .use(authRoutes);

export type App = typeof app;

if (import.meta.main) {
  await init();
  app.listen(PORT);
  console.log(`[web-server] listening on :${PORT}`);
}

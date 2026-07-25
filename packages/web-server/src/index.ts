import { Elysia } from 'elysia';
import type { PostaConfig } from '@posta/core';
import { loadConfig, initializeMainDb } from '@posta/core';
import type { MessageDbProvisioner } from '@posta/message-db';
import { MessageStore } from '@posta/message-db';
import { sendRoutes } from './routes/api/v1/send.routes';
import { messagesRoutes } from './routes/api/v1/messages.routes';
import { apiAuth, requireApiAuth } from './middleware/api-auth';
import { clerkAuth } from './middleware/clerk-auth';
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
import { authRoutes } from './routes/auth.routes';
import { clerkWebhookRoutes } from './routes/clerk-webhooks.routes';

// Lazy initialization — config is loaded when init() is called
let config: PostaConfig;
let provisioner: MessageDbProvisioner;
let db: ReturnType<typeof initializeMainDb>;

function init(): void {
  if (config) return;
  config = loadConfig();
  db = initializeMainDb(config);
  const { MessageDbProvisioner: MDP } = require('@posta/message-db');
  provisioner = new MDP(config);
}

export function getDb() { init(); return db; }
export function getConfig() { init(); return config; }
export function getProvisioner() { init(); return provisioner; }
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

  .use(clerkWebhookRoutes)
  .use(apiAuth)
  .use(sendRoutes)
  .use(messagesRoutes)
  // Clerk auth + protection for Web UI API routes
  .use(clerkAuth)
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
  .use(wellKnownRoutes)
  .use(settingsRoutes)
  .use(authRoutes);

export type App = typeof app;

if (import.meta.main) {
  init();
  app.listen(PORT);
  console.log(`[web-server] listening on :${PORT}`);
}

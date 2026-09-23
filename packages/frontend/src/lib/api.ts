export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5001';

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) ?? {}),
  };

  if (typeof window === 'undefined') {
    // Server components: forward the visitor's Clerk session cookie.
    try {
      const { cookies } = await import('next/headers');
      const store = await cookies();
      const sess = store.get('__session')?.value;
      if (sess) {
        headers['Cookie'] = `__session=${sess}`;
      }
    } catch {}
  } else {
    // The browser: the API is on another origin, so the session cookie isn't
    // sent. Pass the Clerk session token as a bearer token instead.
    const token = await browserSessionToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? body.message ?? 'API error', body.error);
  }
  return res.json();
}

/**
 * The signed-in user's Clerk session token. A page can call the API before
 * Clerk has finished loading, so wait briefly for it rather than sending an
 * unauthenticated request that is bound to fail.
 */
async function browserSessionToken(): Promise<string | null> {
  const w = window as unknown as {
    Clerk?: { loaded?: boolean; session?: { getToken(): Promise<string | null> } | null };
  };
  for (let waited = 0; !w.Clerk?.loaded && waited < 5000; waited += 50) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  try {
    return (await w.Clerk?.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  status: number;
  /** The API's machine-readable error, e.g. "NotProvisioned". */
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// ─── Account ─────────────────────────────────────────────

export interface Me {
  id: number;
  admin: boolean;
  email_address: string | null;
  first_name: string | null;
  last_name: string | null;
}

export async function getMe() {
  return fetchApi<{ user: Me }>('/me', { cache: 'no-store' });
}

/** Public. `admin_exists: false` means nobody has set this installation up yet. */
export async function getSetupStatus() {
  return fetchApi<{ admin_exists: boolean }>('/setup/status', { cache: 'no-store' });
}

/**
 * True when nobody has created the admin account yet. Null when the API
 * can't be reached: the public pages still render, with neutral copy.
 */
export async function isFirstRun(): Promise<boolean | null> {
  try {
    return !(await getSetupStatus()).admin_exists;
  } catch {
    return null;
  }
}

// ─── Servers ─────────────────────────────────────────────

export async function getServers(orgPermalink: string) {
  return fetchApi<{ servers: any[] }>(`/org/${orgPermalink}/servers`);
}

export async function getServer(orgPermalink: string, serverId: string) {
  return fetchApi<{ server: any }>(`/org/${orgPermalink}/servers/${serverId}`);
}

export async function createServer(orgPermalink: string, data: any) {
  return fetchApi<{ server: any }>(`/org/${orgPermalink}/servers`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateServer(orgPermalink: string, serverId: string, data: any) {
  return fetchApi<{ server: any }>(`/org/${orgPermalink}/servers/${serverId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteServer(orgPermalink: string, serverId: string, confirm_text: string) {
  return fetchApi<{ deleted: boolean }>(`/org/${orgPermalink}/servers/${serverId}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirm_text }),
  });
}

export async function getServerQueue(orgPermalink: string, serverId: string, page = 1) {
  return fetchApi<{ messages: any[]; page: number }>(
    `/org/${orgPermalink}/servers/${serverId}/queue?page=${page}`,
  );
}

export async function getServerLimits(orgPermalink: string, serverId: string) {
  return fetchApi<{
    send_limit: number;
    sent_today: number;
    approaching: boolean;
    exceeded: boolean;
  }>(`/org/${orgPermalink}/servers/${serverId}/limits`);
}

// ─── Messages ────────────────────────────────────────────

export async function getMessageCounts(orgPermalink: string, serverId: string) {
  return fetchApi<{ incoming: number; outgoing: number; held: number; bounced: number }>(
    `/org/${orgPermalink}/servers/${serverId}/messages/counts`,
  );
}

export async function getMessages(orgPermalink: string, serverId: string, scope = '', page = 1) {
  const path = scope
    ? `/org/${orgPermalink}/servers/${serverId}/messages/${scope}?page=${page}`
    : `/org/${orgPermalink}/servers/${serverId}/messages?page=${page}`;
  return fetchApi<{ messages: any[]; page: number; total_pages: number }>(path);
}

export async function getMessage(orgPermalink: string, serverId: string, messageId: string) {
  return fetchApi<{ message: any }>(
    `/org/${orgPermalink}/servers/${serverId}/messages/${messageId}`,
  );
}

export async function retryMessage(orgPermalink: string, serverId: string, messageId: string) {
  return fetchApi<{ status: string }>(
    `/org/${orgPermalink}/servers/${serverId}/messages/${messageId}/retry`,
    { method: 'POST' },
  );
}

// ─── Domains ─────────────────────────────────────────────

export async function getDomains(orgPermalink: string, serverId: string) {
  return fetchApi<{ domains: any[] }>(`/org/${orgPermalink}/servers/${serverId}/domains`);
}

export async function createDomain(orgPermalink: string, serverId: string, data: any) {
  return fetchApi<{ domain: any }>(`/org/${orgPermalink}/servers/${serverId}/domains`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteDomain(orgPermalink: string, serverId: string, domainId: string) {
  return fetchApi<{ deleted: boolean }>(
    `/org/${orgPermalink}/servers/${serverId}/domains/${domainId}`,
    { method: 'DELETE' },
  );
}

export async function updateDomain(
  orgPermalink: string,
  serverId: string,
  domainId: string,
  data: any,
) {
  return fetchApi<{ domain: any }>(`/org/${orgPermalink}/servers/${serverId}/domains/${domainId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function checkDomainDns(orgPermalink: string, serverId: string, domainId: string) {
  return fetchApi<{
    spf_status: string;
    dkim_status: string;
    mx_status: string;
    return_path_status: string;
  }>(`/org/${orgPermalink}/servers/${serverId}/domains/${domainId}/check`, { method: 'POST' });
}

// ─── Credentials ─────────────────────────────────────────

export async function getCredentials(orgPermalink: string, serverId: string) {
  return fetchApi<{ credentials: any[] }>(`/org/${orgPermalink}/servers/${serverId}/credentials`);
}

export async function createCredential(orgPermalink: string, serverId: string, data: any) {
  return fetchApi<{ credential: any }>(`/org/${orgPermalink}/servers/${serverId}/credentials`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Routes ──────────────────────────────────────────────

export async function getRoutes(orgPermalink: string, serverId: string) {
  return fetchApi<{ routes: any[] }>(`/org/${orgPermalink}/servers/${serverId}/routes`);
}

export async function createRoute(orgPermalink: string, serverId: string, data: any) {
  return fetchApi<{ route: any }>(`/org/${orgPermalink}/servers/${serverId}/routes`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteRoute(orgPermalink: string, serverId: string, routeId: string) {
  return fetchApi<{ deleted: boolean }>(
    `/org/${orgPermalink}/servers/${serverId}/routes/${routeId}`,
    { method: 'DELETE' },
  );
}

// ─── Endpoints ───────────────────────────────────────────

export async function getEndpoints(orgPermalink: string, serverId: string) {
  return fetchApi<{ http_endpoints: any[]; smtp_endpoints: any[]; address_endpoints: any[] }>(
    `/org/${orgPermalink}/servers/${serverId}/endpoints`,
  );
}

// ─── Webhooks ────────────────────────────────────────────

export async function getWebhooks(orgPermalink: string, serverId: string) {
  return fetchApi<{ webhooks: any[] }>(`/org/${orgPermalink}/servers/${serverId}/webhooks`);
}

export async function createWebhook(orgPermalink: string, serverId: string, data: any) {
  return fetchApi<{ webhook: any }>(`/org/${orgPermalink}/servers/${serverId}/webhooks`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteWebhook(orgPermalink: string, serverId: string, webhookId: string) {
  return fetchApi<{ deleted: boolean }>(
    `/org/${orgPermalink}/servers/${serverId}/webhooks/${webhookId}`,
    { method: 'DELETE' },
  );
}

// ─── Organizations ───────────────────────────────────────

export async function getOrganizations() {
  return fetchApi<{ organizations: any[] }>('/organizations');
}

export async function getOrganizationStats() {
  return fetchApi<{ organizations: any[] }>('/organizations/stats');
}

export async function getOrganization(orgId: string) {
  return fetchApi<{ organization: any }>(`/organizations/${orgId}`);
}

export async function createOrganization(data: any) {
  return fetchApi<{ organization: any }>('/organizations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateOrganization(orgId: string, data: any) {
  return fetchApi<{ organization: any }>(`/organizations/${orgId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ─── Users ───────────────────────────────────────────────

export async function getUsers() {
  return fetchApi<{ users: any[] }>('/users');
}

export async function createUser(data: any) {
  return fetchApi<{ user: any }>('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Track Domains ───────────────────────────────────────

export async function getTrackDomains(orgPermalink: string, serverId: string) {
  return fetchApi<{ track_domains: any[] }>(
    `/org/${orgPermalink}/servers/${serverId}/track_domains`,
  );
}

export async function createTrackDomain(orgPermalink: string, serverId: string, data: any) {
  return fetchApi<{ track_domain: any }>(`/org/${orgPermalink}/servers/${serverId}/track_domains`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteTrackDomain(orgPermalink: string, serverId: string, domainId: string) {
  return fetchApi(`/org/${orgPermalink}/servers/${serverId}/track_domains/${domainId}`, {
    method: 'DELETE',
  });
}

// ─── IP Pools ────────────────────────────────────────────

export async function getIpPools() {
  return fetchApi<{ ip_pools: any[] }>('/ip_pools');
}

export async function createIpPool(data: any) {
  return fetchApi<{ ip_pool: any }>('/ip_pools', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getIpPool(poolId: string) {
  return fetchApi<{ ip_pool: any }>(`/ip_pools/${poolId}`);
}

export async function getIpAddresses(poolId: string) {
  return fetchApi<{ ip_addresses: any[] }>(`/ip_pools/${poolId}/ip_addresses`);
}

export async function createIpAddress(poolId: string, data: any) {
  return fetchApi<{ ip_address: any }>(`/ip_pools/${poolId}/ip_addresses`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteIpAddress(poolId: string, addressId: string) {
  return fetchApi(`/ip_pools/${poolId}/ip_addresses/${addressId}`, { method: 'DELETE' });
}

// ─── Endpoints ───────────────────────────────────────────

export async function createEndpoint(
  orgPermalink: string,
  serverId: string,
  type: 'http' | 'smtp' | 'address',
  data: any,
) {
  return fetchApi<{ endpoint: any }>(`/org/${orgPermalink}/servers/${serverId}/endpoints/${type}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Domain Setup ───────────────────────────────────────

export async function getDomain(orgPermalink: string, serverId: string, domainId: string) {
  return fetchApi<{ domain: any }>(`/org/${orgPermalink}/servers/${serverId}/domains/${domainId}`);
}

export async function getDomainSetup(orgPermalink: string, serverId: string, domainId: string) {
  return fetchApi<{
    domain: string;
    spf: string;
    dkim: string;
    mx: string;
    return_path: string;
    verification_token?: string;
  }>(`/org/${orgPermalink}/servers/${serverId}/domains/${domainId}/dns`);
}

// ─── Track Domains ───────────────────────────────────────

export async function getTrackDomain(orgPermalink: string, serverId: string, domainId: string) {
  return fetchApi<{ track_domain: any }>(
    `/org/${orgPermalink}/servers/${serverId}/track_domains/${domainId}`,
  );
}

export async function updateTrackDomain(
  orgPermalink: string,
  serverId: string,
  domainId: string,
  data: any,
) {
  return fetchApi<{ track_domain: any }>(
    `/org/${orgPermalink}/servers/${serverId}/track_domains/${domainId}`,
    { method: 'PATCH', body: JSON.stringify(data) },
  );
}

export async function toggleTrackDomainSsl(
  orgPermalink: string,
  serverId: string,
  domainId: string,
) {
  return fetchApi<{ ssl_enabled: boolean }>(
    `/org/${orgPermalink}/servers/${serverId}/track_domains/${domainId}/toggle_ssl`,
    { method: 'POST' },
  );
}

export async function checkTrackDomainDns(
  orgPermalink: string,
  serverId: string,
  domainId: string,
) {
  return fetchApi<{ status: string }>(
    `/org/${orgPermalink}/servers/${serverId}/track_domains/${domainId}/check`,
    { method: 'POST' },
  );
}

// ─── Webhooks ────────────────────────────────────────────

export async function getWebhook(orgPermalink: string, serverId: string, webhookId: string) {
  return fetchApi<{ webhook: any }>(
    `/org/${orgPermalink}/servers/${serverId}/webhooks/${webhookId}`,
  );
}

export async function updateWebhook(
  orgPermalink: string,
  serverId: string,
  webhookId: string,
  data: any,
) {
  return fetchApi<{ webhook: any }>(
    `/org/${orgPermalink}/servers/${serverId}/webhooks/${webhookId}`,
    { method: 'PATCH', body: JSON.stringify(data) },
  );
}

export async function getWebhookHistory(orgPermalink: string, serverId: string, webhookId: string) {
  return fetchApi<{ requests: any[] }>(
    `/org/${orgPermalink}/servers/${serverId}/webhooks/${webhookId}/history`,
  );
}

// ─── Message Sub-views ───────────────────────────────────

export async function getMessagePlain(orgPermalink: string, serverId: string, messageId: string) {
  return fetchApi<{ body: string }>(
    `/org/${orgPermalink}/servers/${serverId}/messages/${messageId}/plain`,
  );
}

export async function getMessageHtml(orgPermalink: string, serverId: string, messageId: string) {
  return fetchApi<{ body: string }>(
    `/org/${orgPermalink}/servers/${serverId}/messages/${messageId}/html`,
  );
}

export async function getMessageHeaders(orgPermalink: string, serverId: string, messageId: string) {
  return fetchApi<{ headers: Record<string, string[]> }>(
    `/org/${orgPermalink}/servers/${serverId}/messages/${messageId}/headers`,
  );
}

export async function getMessageAttachments(
  orgPermalink: string,
  serverId: string,
  messageId: string,
) {
  return fetchApi<{ attachments: any[] }>(
    `/org/${orgPermalink}/servers/${serverId}/messages/${messageId}/attachments`,
  );
}

// ─── IP Pool Rules ───────────────────────────────────────

export async function getOrgIpPoolRules(orgPermalink: string) {
  return fetchApi<{ ip_pool_rules: any[] }>(`/org/${orgPermalink}/ip_pool_rules`);
}

export async function createOrgIpPoolRule(orgPermalink: string, data: any) {
  return fetchApi<{ ip_pool_rule: any }>(`/org/${orgPermalink}/ip_pool_rules`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteOrgIpPoolRule(orgPermalink: string, ruleId: string) {
  return fetchApi<{ deleted: boolean }>(`/org/${orgPermalink}/ip_pool_rules/${ruleId}`, {
    method: 'DELETE',
  });
}

// ─── Credentials ─────────────────────────────────────────

export async function getCredential(orgPermalink: string, serverId: string, credId: string) {
  return fetchApi<{ credential: any }>(
    `/org/${orgPermalink}/servers/${serverId}/credentials/${credId}`,
  );
}

export async function updateCredential(
  orgPermalink: string,
  serverId: string,
  credId: string,
  data: any,
) {
  return fetchApi<{ credential: any }>(
    `/org/${orgPermalink}/servers/${serverId}/credentials/${credId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );
}

export async function deleteCredential(orgPermalink: string, serverId: string, credId: string) {
  return fetchApi<{ deleted: boolean }>(
    `/org/${orgPermalink}/servers/${serverId}/credentials/${credId}`,
    {
      method: 'DELETE',
    },
  );
}

// ─── Routes ──────────────────────────────────────────────

export async function getRoute(orgPermalink: string, serverId: string, routeId: string) {
  return fetchApi<{ route: any }>(`/org/${orgPermalink}/servers/${serverId}/routes/${routeId}`);
}

export async function updateRoute(
  orgPermalink: string,
  serverId: string,
  routeId: string,
  data: any,
) {
  return fetchApi<{ route: any }>(`/org/${orgPermalink}/servers/${serverId}/routes/${routeId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ─── Endpoints ───────────────────────────────────────────

export async function getEndpoint(
  orgPermalink: string,
  serverId: string,
  type: string,
  endpointId: string,
) {
  return fetchApi<{ endpoint: any }>(
    `/org/${orgPermalink}/servers/${serverId}/endpoints/${type}/${endpointId}`,
  );
}

export async function updateEndpoint(
  orgPermalink: string,
  serverId: string,
  type: string,
  endpointId: string,
  data: any,
) {
  return fetchApi<{ endpoint: any }>(
    `/org/${orgPermalink}/servers/${serverId}/endpoints/${type}/${endpointId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );
}

export async function deleteEndpoint(
  orgPermalink: string,
  serverId: string,
  type: string,
  endpointId: string,
) {
  return fetchApi<{ deleted: boolean }>(
    `/org/${orgPermalink}/servers/${serverId}/endpoints/${type}/${endpointId}`,
    {
      method: 'DELETE',
    },
  );
}

// ─── Users (Admin) ────────────────────────────────────────

export async function getUser(userId: string) {
  return fetchApi<{ user: any }>(`/users/${userId}`);
}

export async function updateUser(userId: string, data: any) {
  return fetchApi<{ user: any }>(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteUser(userId: string) {
  return fetchApi<{ deleted: boolean }>(`/users/${userId}`, {
    method: 'DELETE',
  });
}

// ─── Settings ────────────────────────────────────────────

export async function getSettings() {
  return fetchApi<{ user: any }>('/settings');
}

export async function updateSettings(data: any) {
  return fetchApi<{ user: any }>('/settings', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ─── Test message ──────────────────────────────────────────

export async function sendTestMessage(
  orgPermalink: string,
  serverId: number,
  to: string,
  from?: string,
) {
  return fetchApi<{ status: string; message_id: number }>(
    `/org/${orgPermalink}/servers/${serverId}/messages`,
    { method: 'POST', body: JSON.stringify({ to, from }) },
  );
}

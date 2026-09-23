import { Suspense } from 'react';
import SetupWizardClient from './wizard-client';
import { getOrganization, getServers, getOrganizationStats } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface PreloadedOrg {
  orgId: number | null;
  orgPermalink: string | null;
  orgName: string;
  serverId: number | null;
  serverName: string;
  serverCount: number;
  domainCount: number;
  verifiedCount: number;
  credentialCount: number;
  routeCount: number;
}

async function preloadOrg(permalink: string | null): Promise<PreloadedOrg | null> {
  if (!permalink) return null;
  try {
    const [orgData, serversData, statsData] = await Promise.allSettled([
      getOrganization(permalink),
      getServers(permalink),
      getOrganizationStats(),
    ]);

    const result: PreloadedOrg = {
      orgId: null,
      orgPermalink: permalink,
      orgName: '',
      serverId: null,
      serverName: '',
      serverCount: 0,
      domainCount: 0,
      verifiedCount: 0,
      credentialCount: 0,
      routeCount: 0,
    };

    if (orgData.status === 'fulfilled' && orgData.value.organization) {
      result.orgName = orgData.value.organization.name ?? '';
      result.orgId = orgData.value.organization.id ?? null;
    }

    if (serversData.status === 'fulfilled' && serversData.value.servers?.length > 0) {
      const s = serversData.value.servers[0];
      result.serverId = s.id;
      result.serverName = s.name ?? '';
      result.serverCount = serversData.value.servers.length;
    }

    if (statsData.status === 'fulfilled') {
      const found = statsData.value.organizations.find((o: any) => o.permalink === permalink);
      if (found) {
        result.serverCount = found.server_count ?? result.serverCount;
        result.domainCount = found.domain_count ?? 0;
        result.verifiedCount = found.verified_count ?? 0;
        result.credentialCount = found.credential_count ?? 0;
        result.routeCount = found.route_count ?? 0;
      }
    }

    return result;
  } catch {
    return null;
  }
}

export default async function SetupWizardPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ org?: string; welcome?: string }>;
}) {
  const { org, welcome } = await searchParamsPromise;
  const preloaded = await preloadOrg(org ?? null);

  return (
    <>
      <Suspense fallback={<div className="text-center py-16 text-muted">Loading wizard...</div>}>
        <SetupWizardClient
          initialOrgPermalink={org ?? null}
          preloaded={preloaded}
          welcome={welcome === '1'}
        />
      </Suspense>
    </>
  );
}

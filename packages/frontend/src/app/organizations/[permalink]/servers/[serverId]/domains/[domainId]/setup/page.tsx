import { getDomain, getDomainSetup } from '@/lib/api';
import { DomainDnsPanel } from '@/components/domains/domain-dns-panel';
import { BackLink } from '@/components/ui/back-link';
import { PageHeader } from '@/components/ui/page-header';
export const dynamic = 'force-dynamic';

export default async function DomainSetupPage({ params }: {
  params: Promise<{ permalink: string; serverId: string; domainId: string }>;
}) {
  const { permalink, serverId, domainId } = await params;
  const [data, setup] = await Promise.all([
    getDomain(permalink, serverId, domainId), getDomainSetup(permalink, serverId, domainId),
  ]);
  return <>
    <PageHeader title={data.domain.name} description="DNS setup and domain verification"
      breadcrumb={<BackLink href={`/organizations/${permalink}/servers/${serverId}/domains`}>Domains</BackLink>} />
    <DomainDnsPanel org={permalink} serverId={serverId} domainId={domainId}
      initialDomain={data.domain} initialSetup={setup} />
  </>;
}

import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Circle,
  Plus,
  Server as ServerIcon,
  Settings,
  Sparkles,
} from 'lucide-react';
import { getServers, getOrganization, getOrganizationStats } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { BackLink } from '@/components/ui/back-link';
import { Card, StatCard } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { FlagPill } from '@/components/ui/pill';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface MailServer {
  id: number;
  name: string;
  mode?: string;
}

interface OrgStat {
  server_count: number;
  verified_count: number;
  domain_count: number;
  credential_count: number;
  route_count: number;
}

const EMPTY_STATS: OrgStat = {
  server_count: 0,
  verified_count: 0,
  domain_count: 0,
  credential_count: 0,
  route_count: 0,
};

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ permalink: string }>;
}) {
  const { permalink } = await params;

  const [orgResult, serverResult, statsResult] = await Promise.allSettled([
    getOrganization(permalink),
    getServers(permalink),
    getOrganizationStats(),
  ]);

  const organization: { name?: string; permalink: string } =
    orgResult.status === 'fulfilled'
      ? (orgResult.value.organization ?? { permalink })
      : { permalink };
  const servers: MailServer[] =
    serverResult.status === 'fulfilled' ? serverResult.value.servers : [];
  const stats: OrgStat =
    statsResult.status === 'fulfilled'
      ? (statsResult.value.organizations.find(
          (o: { permalink: string }) => o.permalink === permalink,
        ) ?? EMPTY_STATS)
      : EMPTY_STATS;

  const heading = (
    <PageHeader
      breadcrumb={<BackLink href="/organizations">Organizations</BackLink>}
      title={organization.name ?? permalink}
      description={
        servers.length === 0
          ? 'No servers yet. A server is what actually sends and receives mail.'
          : `${servers.length} server${servers.length === 1 ? '' : 's'} in this organisation.`
      }
      actions={
        <>
          <ButtonLink href={`/organizations/${permalink}/ip-pool-rules`} variant="secondary">
            <Settings size={15} aria-hidden /> IP pool rules
          </ButtonLink>
          <ButtonLink href={`/organizations/${permalink}/servers/new`} variant="primary">
            <Plus size={15} aria-hidden /> New server
          </ButtonLink>
        </>
      }
    />
  );

  // The server list is the page. Everything else decorates it, so a failure
  // there is worth stopping for rather than rendering an empty grid.
  if (serverResult.status === 'rejected') {
    return (
      <>
        {heading}
        <Card>
          <ErrorState
            error={serverResult.reason}
            what="this organisation's servers"
            retryHref={`/organizations/${permalink}`}
          />
        </Card>
      </>
    );
  }

  const liveServers = servers.filter((s) => (s.mode ?? 'Live').toLowerCase() === 'live').length;
  const devServers = servers.length - liveServers;

  const firstServer = servers[0];
  const serverBase = firstServer ? `/organizations/${permalink}/servers/${firstServer.id}` : null;

  /**
   * The setup checklist, in the order the steps actually depend on each
   * other: no domain without a server, no verification without a domain.
   * `href` is the screen that completes the step, so an incomplete item is a
   * link rather than a label telling you to go and find it.
   */
  const checklist = [
    {
      label: 'Create a server',
      done: servers.length > 0,
      href: `/organizations/${permalink}/servers/new`,
    },
    {
      label: 'Add a domain',
      done: stats.domain_count > 0,
      href: serverBase && `${serverBase}/domains`,
    },
    {
      label: 'Verify DNS records',
      done: stats.verified_count > 0,
      href: serverBase && `${serverBase}/domains`,
    },
    {
      label: 'Create credentials',
      done: stats.credential_count > 0,
      href: serverBase && `${serverBase}/credentials`,
    },
    {
      label: 'Configure routing',
      done: stats.route_count > 0,
      href: serverBase && `${serverBase}/routes`,
    },
  ];

  const doneCount = checklist.filter((c) => c.done).length;
  const allDone = doneCount === checklist.length;

  return (
    <>
      {heading}

      {statsResult.status === 'rejected' ? (
        <Callout tone="warning" title="Setup progress unavailable">
          The servers loaded, but the statistics endpoint did not respond, so domain, credential and
          route counts are hidden.
        </Callout>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Servers" value={servers.length} />
          <StatCard label="Live" value={liveServers} tone={liveServers > 0 ? 'green' : 'default'} />
          <StatCard label="Development" value={devServers} />
          <StatCard label="Domains" value={stats.domain_count} />
        </div>
      )}

      {!allDone && statsResult.status === 'fulfilled' && (
        <Card padded>
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
              <Sparkles size={17} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-foreground">Finish setting up</h2>
              <p className="mt-0.5 text-xs text-muted">
                {doneCount} of {checklist.length} steps done. Each one unlocks the next.
              </p>

              <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {checklist.map((item) => (
                  <li key={item.label} className="flex items-center gap-2.5">
                    {item.done ? (
                      <span
                        className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-green/15 text-green"
                        aria-hidden
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                    ) : (
                      <Circle size={16} className="shrink-0 text-faint/50" aria-hidden />
                    )}
                    <span className="sr-only">{item.done ? 'Done: ' : 'Not done: '}</span>
                    {!item.done && item.href ? (
                      <Link href={item.href} className="text-xs text-accent hover:underline">
                        {item.label}
                      </Link>
                    ) : (
                      <span className={cn('text-xs', item.done ? 'text-muted' : 'text-faint')}>
                        {item.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              <ButtonLink
                href={`/organizations/setup?org=${permalink}`}
                variant="primary"
                size="sm"
                className="mt-4"
              >
                <Sparkles size={14} aria-hidden /> Open setup wizard
              </ButtonLink>
            </div>
          </div>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Mail servers{' '}
          {servers.length > 0 && (
            <span className="font-normal tabular-nums text-faint">({servers.length})</span>
          )}
        </h2>

        {servers.length === 0 ? (
          <Card>
            <EmptyState
              icon={ServerIcon}
              title="No servers yet"
              description="A server holds the domains, credentials and routes that mail moves through. Create one to start sending."
              action={
                <ButtonLink
                  href={`/organizations/${permalink}/servers/new`}
                  variant="primary"
                  size="sm"
                >
                  <Plus size={14} aria-hidden /> Create server
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {servers.map((server) => {
              const mode = server.mode ?? 'Live';
              const isLive = mode.toLowerCase() === 'live';
              return (
                <Card key={server.id} className="flex flex-col">
                  <div className="flex items-start gap-3 p-5">
                    <span
                      className={cn(
                        'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                        isLive ? 'bg-green/10 text-green' : 'bg-amber/10 text-amber',
                      )}
                    >
                      <ServerIcon size={18} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {server.name}
                      </h3>
                      <p className="font-mono text-2xs text-faint">ID {server.id}</p>
                    </div>
                    <FlagPill on={isLive} onLabel="Live" offLabel={mode} />
                  </div>

                  <p className="flex-1 px-5 pb-4 text-xs leading-relaxed text-muted">
                    Messages, domains, credentials and delivery configuration for this server.
                  </p>

                  <div className="border-t border-line-soft px-5 py-3.5">
                    <ButtonLink
                      href={`/organizations/${permalink}/servers/${server.id}`}
                      size="sm"
                      className="w-full"
                      aria-label={`Open ${server.name}`}
                    >
                      Open server <ArrowRight size={14} aria-hidden />
                    </ButtonLink>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

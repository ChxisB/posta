import Link from 'next/link';
import { ArrowRight, Building2, Mail, Network, Plus, Server, Sparkles } from 'lucide-react';
import { getOrganizations, getOrganizationStats } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, StatCard } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface OrgStats {
  id: number;
  name: string;
  permalink: string;
  server_count: number;
  live_count: number;
  domain_count: number;
  verified_count: number;
  credential_count: number;
  route_count: number;
}

/**
 * The five things that have to exist before an organisation can send mail.
 * Shown as a count here; the organisation's own page names the missing one.
 */
const SETUP_TOTAL = 5;

function setupDone(org: OrgStats): number {
  return [
    org.server_count > 0,
    org.domain_count > 0,
    org.verified_count > 0,
    org.credential_count > 0,
    org.route_count > 0,
  ].filter(Boolean).length;
}

export default async function OrganizationsPage() {
  const [statsResult, orgResult] = await Promise.allSettled([
    getOrganizationStats(),
    getOrganizations(),
  ]);

  const orgStats: OrgStats[] =
    statsResult.status === 'fulfilled' ? statsResult.value.organizations : [];
  const organizations: { id: number; name: string; permalink: string }[] =
    orgResult.status === 'fulfilled' ? orgResult.value.organizations : [];

  // The list drives the page; if it failed there is nothing to show, and the
  // reason matters more than an empty grid does.
  if (orgResult.status === 'rejected') {
    return (
      <>
        <PageHeader title="Organizations" />
        <Card>
          <ErrorState
            error={orgResult.reason}
            what="your organizations"
            retryHref="/organizations"
          />
        </Card>
      </>
    );
  }

  const activeServers = orgStats.reduce((sum, o) => sum + o.live_count, 0);
  const verifiedDomains = orgStats.reduce((sum, o) => sum + o.verified_count, 0);
  const incomplete = orgStats.filter((o) => setupDone(o) < SETUP_TOTAL);

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Every organisation on this installation, and how far through setup each one is."
        actions={
          <>
            {organizations.length > 0 && (
              <ButtonLink href="/organizations/setup" variant="secondary">
                <Sparkles size={15} aria-hidden /> Setup wizard
              </ButtonLink>
            )}
            <ButtonLink href="/organizations/new" variant="primary">
              <Plus size={15} aria-hidden /> New organization
            </ButtonLink>
          </>
        }
      />

      {/* Stats come from a second endpoint. If only that one failed the list
          is still worth showing, so say so rather than rendering zeroes that
          would read as "nothing is running". */}
      {statsResult.status === 'rejected' ? (
        <Callout tone="warning" title="Delivery figures unavailable">
          The organisation list loaded, but the statistics endpoint did not respond. Counts and
          setup progress are hidden until it recovers.
        </Callout>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Organizations" value={organizations.length} />
          <StatCard
            label="Active servers"
            value={activeServers}
            tone={activeServers > 0 ? 'green' : 'default'}
          />
          <StatCard label="Verified domains" value={verifiedDomains} />
        </div>
      )}

      {incomplete.length > 0 && (
        <Callout
          tone="info"
          title="Some organisations can't send yet"
          action={
            <ButtonLink href="/organizations/setup" variant="primary" size="sm">
              Open wizard <ArrowRight size={14} aria-hidden />
            </ButtonLink>
          }
        >
          {incomplete.length === 1
            ? `${incomplete[0].name} is missing part of its setup.`
            : `${incomplete.length} organisations are missing part of their setup.`}{' '}
          The wizard covers the server, domain, DNS, credential and route steps in order.
        </Callout>
      )}

      {organizations.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="Welcome to Posta"
            description="Create your first organisation and the wizard will walk you through servers, domains, DNS and credentials."
            action={
              <ButtonLink href="/organizations/setup" variant="primary" size="lg">
                <Sparkles size={15} aria-hidden /> Start setup
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            All organizations{' '}
            <span className="font-normal tabular-nums text-faint">({organizations.length})</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {orgStats.map((org) => (
              <OrganizationCard key={org.id} org={org} />
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <QuickLink
          href="/organizations/setup"
          icon={Sparkles}
          title="Setup wizard"
          description="Configure an organisation from scratch, one step at a time."
        />
        <QuickLink
          href="/admin/ip-pools"
          icon={Network}
          title="IP pools"
          description="Outbound addresses and the reputation groups they belong to."
        />
        <QuickLink
          href="/help"
          icon={Mail}
          title="Help"
          description="Sending, receiving, credentials and API keys."
        />
      </section>
    </>
  );
}

function OrganizationCard({ org }: { org: OrgStats }) {
  const done = setupDone(org);
  const complete = done >= SETUP_TOTAL;

  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3 p-5">
        <span
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
            complete ? 'bg-green/10 text-green' : 'bg-accent/10 text-accent',
          )}
        >
          {complete ? <Server size={18} aria-hidden /> : <Building2 size={18} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{org.name}</h3>
          <p className="truncate font-mono text-2xs text-faint">/{org.permalink}</p>
        </div>
      </div>

      <div className="flex-1 px-5 pb-4">
        <p className="text-xs text-muted">
          {org.server_count} server{org.server_count === 1 ? '' : 's'} · {org.domain_count} domain
          {org.domain_count === 1 ? '' : 's'} · {org.credential_count} credential
          {org.credential_count === 1 ? '' : 's'}
        </p>

        <div className="mt-3 flex items-center gap-2">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2"
            role="progressbar"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={SETUP_TOTAL}
            aria-label={`Setup progress for ${org.name}`}
          >
            <div
              className={cn('h-full rounded-full', complete ? 'bg-green' : 'bg-accent')}
              style={{ width: `${(done / SETUP_TOTAL) * 100}%` }}
            />
          </div>
          <span
            className={cn(
              'text-2xs font-semibold whitespace-nowrap tabular-nums',
              complete ? 'text-green' : 'text-faint',
            )}
          >
            {complete ? 'Ready' : `${done}/${SETUP_TOTAL}`}
          </span>
        </div>
      </div>

      <div className="flex gap-2 border-t border-line-soft px-5 py-3.5">
        <ButtonLink href={`/organizations/${org.permalink}`} size="sm" className="flex-1">
          Open <ArrowRight size={14} aria-hidden />
        </ButtonLink>
        {!complete && (
          <ButtonLink
            href={`/organizations/setup?org=${org.permalink}`}
            variant="primary"
            size="sm"
            aria-label={`Finish setting up ${org.name}`}
          >
            <Sparkles size={14} aria-hidden /> Finish
          </ButtonLink>
        )}
      </div>
    </Card>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof Mail;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-line bg-panel p-6 shadow-elev-sm transition-colors hover:bg-panel-2"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
          <Icon size={17} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="flex items-center gap-1 text-sm font-semibold text-foreground">
            {title}
            <ArrowRight
              size={13}
              aria-hidden
              className="-translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
            />
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
        </div>
      </div>
    </Link>
  );
}

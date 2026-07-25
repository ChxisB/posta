import OrgLayout from '@/components/org-layout';
import { getOrganizations, getOrganizationStats } from '@/lib/api';
import Link from 'next/link';
import {
  Building2,
  Plus,
  ArrowRight,
  Server,
  Shield,
  Globe,
  Mail,
  Zap,
  CheckCircle2,
  Circle,
  Sparkles,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  accent: 'blue' | 'green' | 'purple' | 'orange';
}

const accentMap = {
  blue: 'from-blue-500/15 to-blue-500/5 text-blue-600 dark:text-blue-400 ring-blue-500/20',
  green: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
  purple: 'from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400 ring-violet-500/20',
  orange: 'from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400 ring-amber-500/20',
};

const setupStepLabels = ['Server', 'Domain', 'DNS', 'Credentials', 'Routes'] as const;

function getSetupProgress(org: OrgStats): { done: number; total: number } {
  let done = 0;
  if (org.server_count > 0) done++;
  if (org.domain_count > 0) done++;
  if (org.verified_count > 0) done++;
  if (org.credential_count > 0) done++;
  if (org.route_count > 0) done++;
  return { done, total: 5 };
}

function StatCard({ title, value, icon, accent }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden border-border/60 bg-gradient-to-br from-card to-card/95">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ring-1",
          accentMap[accent]
        )}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

export default async function OrganizationsPage() {
  let orgStats: OrgStats[] = [];
  let organizations: { id: number; name: string; permalink: string }[] = [];
  try {
    const [statsData, orgData] = await Promise.allSettled([
      getOrganizationStats(),
      getOrganizations(),
    ]);
    if (statsData.status === 'fulfilled') orgStats = statsData.value.organizations;
    if (orgData.status === 'fulfilled') organizations = orgData.value.organizations;
  } catch {}

  const totalActiveServers = orgStats.reduce((sum, o) => sum + o.live_count, 0);
  const totalVerifiedDomains = orgStats.reduce((sum, o) => sum + o.verified_count, 0);
  const anyIncomplete = orgStats.some((o) => {
    const p = getSetupProgress(o);
    return p.done < p.total;
  });

  return (
    <OrgLayout>
      <div className="animate-fade-in space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Manage your mail server organizations and monitor delivery health.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {organizations.length > 0 && (
              <Link href="/organizations/setup" className={buttonVariants({ variant: 'outline' })}>
                <Sparkles className="mr-2 h-4 w-4" /> Setup Wizard
              </Link>
            )}
            <Link href="/organizations/new" className={buttonVariants({ size: 'default' })}>
              <Plus className="mr-2 h-4 w-4" /> New Organization
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            title="Total Organizations"
            value={organizations.length}
            icon={<Building2 className="h-4 w-4" />}
            accent="blue"
          />
          <StatCard
            title="Active Servers"
            value={totalActiveServers}
            icon={<Server className="h-4 w-4" />}
            accent="green"
          />
          <StatCard
            title="Verified Domains"
            value={totalVerifiedDomains}
            icon={<Globe className="h-4 w-4" />}
            accent="purple"
          />
        </div>

        {/* Getting started banner */}
        {anyIncomplete && (
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-primary/5 to-transparent">
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">Complete your setup</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Some organizations need additional configuration. Use the setup wizard for a guided walkthrough.
                  </p>
                </div>
                <Link
                  href="/organizations/setup"
                  className={buttonVariants()}
                >
                  Open Setup Wizard <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Organizations */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Your Organizations</h2>
            <span className="text-sm text-muted-foreground">
              {organizations.length} {organizations.length === 1 ? 'organization' : 'organizations'}
            </span>
          </div>

          {organizations.length === 0 ? (
            <Card className="border-dashed border-2 border-border/80 bg-card/50">
              <CardContent className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/20 mb-5">
                  <Building2 className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Welcome to Posta</h3>
                <p className="text-muted-foreground max-w-sm mb-6">
                  Create your first organization and we will guide you through setting up mail servers, domains, and credentials.
                </p>
                <Link href="/organizations/setup" className={buttonVariants({ size: 'lg' })}>
                  <Sparkles className="mr-2 h-4 w-4" /> Start Setup Wizard
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {orgStats.map((org) => (
                <OrganizationCard key={org.id} org={org} />
              ))}
            </div>
          )}
        </section>

        {/* Quick links */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLinkCard
            href="/organizations/setup"
            title="Setup Wizard"
            description="Guided walkthrough to configure a new organization from scratch."
            icon={<Sparkles className="h-5 w-5" />}
            accent="purple"
          />
          <QuickLinkCard
            href="/admin/ip-pools"
            title="IP Pools"
            description="Configure sending IPs and reputation groups."
            icon={<Zap className="h-5 w-5" />}
            accent="purple"
          />
          <QuickLinkCard
            href="/help"
            title="Documentation"
            description="Learn how to send your first email."
            icon={<Mail className="h-5 w-5" />}
            accent="blue"
          />
        </section>
      </div>
    </OrgLayout>
  );
}

function OrganizationCard({ org }: { org: OrgStats }) {
  const { done, total } = getSetupProgress(org);
  const isComplete = done >= total;

  return (
    <Card className="group flex flex-col overflow-hidden border-border/60 bg-gradient-to-br from-card to-card/95 transition-all hover:shadow-lg hover:border-primary/20">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ring-1",
              isComplete
                ? 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20'
                : 'from-primary/15 to-primary/5 text-primary ring-1 ring-primary/20'
            )}>
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{org.name}</CardTitle>
              <CardDescription className="text-xs">/{org.permalink}</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <p className="text-sm text-muted-foreground">
          {org.server_count} server{org.server_count !== 1 ? 's' : ''} &middot;{' '}
          {org.domain_count} domain{org.domain_count !== 1 ? 's' : ''} &middot;{' '}
          {org.credential_count} credential{org.credential_count !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                isComplete ? 'bg-emerald-500' : 'bg-primary'
              )}
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
          <span className={cn(
            'text-xs font-medium whitespace-nowrap',
            isComplete ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
          )}>
            {isComplete ? 'Complete' : `${done}/${total}`}
          </span>
        </div>
      </CardContent>
      <CardFooter className="bg-muted/30 border-t">
        <div className="flex w-full gap-2">
          <Link
            href={`/organizations/${org.permalink}`}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'flex-1 group-hover:border-primary/30 group-hover:bg-primary/5 transition-colors'
            )}
          >
            View <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          {!isComplete && (
            <Link
              href={`/organizations/setup?org=${org.permalink}`}
              className={cn(
                buttonVariants({ variant: 'default', size: 'sm' }),
                'group-hover:shadow-md transition-all'
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

function QuickLinkCard({
  href,
  title,
  description,
  icon,
  accent,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: 'blue' | 'green' | 'purple' | 'orange';
}) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full border-border/60 bg-gradient-to-br from-card to-card/95 transition-all hover:shadow-md hover:border-primary/20">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 transition-transform group-hover:scale-105",
              accentMap[accent]
            )}>
              {icon}
            </div>
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-1">
                {title}
                <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
              </h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { getServers, getOrganization, getOrganizationStats } from '@/lib/api';
import { Plus, Server, ArrowRight, Activity, Globe, Cpu, Settings, Sparkles, CheckCircle2, Circle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Server {
  id: number;
  name: string;
  mode?: string;
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

const checklistItems = [
  { key: 'server', label: 'Create a server' },
  { key: 'domain', label: 'Add a domain' },
  { key: 'dns', label: 'Verify DNS records' },
  { key: 'credentials', label: 'Create credentials' },
  { key: 'routes', label: 'Configure routing' },
] as const;

export default async function OrgDetailPage({ params }: { params: Promise<{ permalink: string }> }) {
  const { permalink } = await params;
  let servers: Server[] = [];
  let organization: { name?: string; permalink: string } = { permalink };
  interface OrgStat {
    server_count: number;
    verified_count: number;
    domain_count: number;
    credential_count: number;
    route_count: number;
  }
  let stats: OrgStat = {
    server_count: 0, verified_count: 0,
    domain_count: 0, credential_count: 0, route_count: 0,
  };

  try {
    const [orgData, serverData, statsData] = await Promise.allSettled([
      getOrganization(permalink),
      getServers(permalink),
      getOrganizationStats(),
    ]);
    if (orgData.status === 'fulfilled') organization = orgData.value.organization ?? organization;
    if (serverData.status === 'fulfilled') servers = serverData.value.servers;
    if (statsData.status === 'fulfilled') {
      const found = statsData.value.organizations.find((o: any) => o.permalink === permalink);
      if (found) stats = found;
    }
  } catch {}

  const liveServers = servers.filter((s) => (s.mode ?? 'Live').toLowerCase() === 'live').length;
  const devServers = servers.length - liveServers;

  const checklist = [
    { done: servers.length > 0, link: servers.length > 0 ? null : `/organizations/${permalink}/servers/new` },
    { done: stats.domain_count > 0, link: stats.domain_count > 0 ? null : (servers.length > 0 ? `/organizations/${permalink}/servers/${servers[0].id}/domains` : null) },
    { done: stats.verified_count > 0, link: null },
    { done: stats.credential_count > 0, link: stats.credential_count > 0 ? null : (servers.length > 0 ? `/organizations/${permalink}/servers/${servers[0].id}/credentials` : null) },
    { done: stats.route_count > 0, link: null },
  ];

  const doneCount = checklist.filter((c) => c.done).length;
  const allDone = doneCount === checklist.length;

  return (
    <OrgLayout orgPermalink={permalink}>
      <div className="animate-fade-in space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Link href="/organizations" className="hover:text-primary transition-colors">Organizations</Link>
              <span>/</span>
              <span>{organization.permalink}</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{organization.name ?? permalink}</h1>
            <p className="text-muted-foreground mt-1">
              {servers.length} {servers.length === 1 ? 'server' : 'servers'} in this organization
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/organizations/${permalink}/ip-pool-rules`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Settings className="mr-2 h-4 w-4" /> Rules
            </Link>
            {!allDone && (
              <Link href={`/organizations/setup?org=${permalink}`} className={buttonVariants()}>
                <Sparkles className="mr-2 h-4 w-4" /> Resume Setup
              </Link>
            )}
            <Link href={`/organizations/${permalink}/servers/new`} className={buttonVariants({ variant: 'outline' })}>
              <Plus className="mr-2 h-4 w-4" /> New Server
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Servers" value={servers.length} icon={<Server className="h-4 w-4" />} accent="blue" />
          <StatCard title="Live" value={liveServers} icon={<Activity className="h-4 w-4" />} accent="green" />
          <StatCard title="Development" value={devServers} icon={<Cpu className="h-4 w-4" />} accent="orange" />
          <StatCard title="Domains" value={stats.domain_count} icon={<Globe className="h-4 w-4" />} accent="purple" />
        </div>

        {/* Getting started checklist */}
        {!allDone && (
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-primary/5 to-transparent">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm">Getting Started</h3>
                  <p className="text-sm text-muted-foreground mt-0.5 mb-4">
                    {doneCount} of {checklist.length} setup steps complete
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {checklistItems.map((item, i) => {
                      const { done, link } = checklist[i];
                      return (
                        <div key={item.key} className="flex items-center gap-2.5">
                          {done ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                          )}
                          {link && !done ? (
                            <Link href={link} className="text-sm text-primary hover:underline">
                              {item.label}
                            </Link>
                          ) : (
                            <span className={`text-sm ${done ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
                              {item.label}
                              {done && ' ✓'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4">
                    <Link
                      href={`/organizations/setup?org=${permalink}`}
                      className={buttonVariants({ size: 'sm' })}
                    >
                      <Sparkles className="mr-2 h-4 w-4" /> Open Setup Wizard
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Servers */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Mail Servers</h2>
            <Link
              href={`/organizations/${permalink}/servers/new`}
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1')}
            >
              <Plus className="h-4 w-4" /> Add server
            </Link>
          </div>

          {servers.length === 0 ? (
            <Card className="border-dashed border-2 border-border/80 bg-card/50">
              <CardContent className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/20 mb-5">
                  <Server className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No servers yet</h3>
                <p className="text-muted-foreground max-w-sm mb-6">
                  Create a server to start sending and receiving email through this organization.
                </p>
                <Link href={`/organizations/${permalink}/servers/new`} className={buttonVariants()}>
                  <Plus className="mr-2 h-4 w-4" /> Create Server
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {servers.map((server) => {
                const mode = server.mode ?? 'Live';
                const isLive = mode.toLowerCase() === 'live';
                return (
                  <Card
                    key={server.id}
                    className="group flex flex-col overflow-hidden border-border/60 bg-gradient-to-br from-card to-card/95 transition-all hover:shadow-lg hover:border-primary/20"
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ring-1",
                            isLive
                              ? 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20'
                              : 'from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400 ring-amber-500/20'
                          )}>
                            <Server className="h-6 w-6" />
                          </div>
                          <div>
                            <CardTitle className="text-base font-semibold">{server.name}</CardTitle>
                            <CardDescription className="text-xs">ID {server.id}</CardDescription>
                          </div>
                        </div>
                        <Badge variant={isLive ? 'default' : 'secondary'}>{mode}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        View messages, domains, credentials, and delivery configuration.
                      </p>
                    </CardContent>
                    <CardFooter className="bg-muted/30 border-t">
                      <Link
                        href={`/organizations/${permalink}/servers/${server.id}`}
                        className={cn(
                          buttonVariants({ variant: 'outline' }),
                          'w-full group-hover:border-primary/30 group-hover:bg-primary/5 transition-colors'
                        )}
                      >
                        View Server <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </OrgLayout>
  );
}

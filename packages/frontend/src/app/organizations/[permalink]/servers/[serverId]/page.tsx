import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { getServer, getServerLimits, getServerQueue, getMessageCounts, getMessages } from '@/lib/api';
import ServerSettingsForm from './server-settings-form';
import {
  ArrowLeft,
  Inbox,
  Send,
  PauseCircle,
  Ban,
  Mail,
  ArrowRight,
  Zap,
  Server,
  Settings,
  Activity,
  ShieldAlert,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Tab {
  key: string;
  label: string;
  icon: React.ReactNode;
}

const tabs: Tab[] = [
  { key: '', label: 'Overview', icon: <Activity className="h-4 w-4" /> },
  { key: 'queue', label: 'Queue', icon: <Zap className="h-4 w-4" /> },
  { key: 'limits', label: 'Limits', icon: <Inbox className="h-4 w-4" /> },
  { key: 'spam', label: 'Spam', icon: <ShieldAlert className="h-4 w-4" /> },
  { key: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
];

const accentMap = {
  cyan: 'from-cyan-500/15 to-cyan-500/5 text-cyan-600 dark:text-cyan-400 ring-cyan-500/20',
  green: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
  orange: 'from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400 ring-amber-500/20',
  red: 'from-rose-500/15 to-rose-500/5 text-rose-600 dark:text-rose-400 ring-rose-500/20',
};

export default async function ServerDetailPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ permalink: string; serverId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { permalink, serverId } = await paramsPromise;
  const { tab } = await searchParamsPromise;

  let server: any = {};
  let counts = { incoming: 0, outgoing: 0, held: 0, bounced: 0 };
  let queueMessages: any[] = [];
  let recentMessages: any[] = [];
  let limits: { send_limit: number; sent_today: number; approaching: boolean; exceeded: boolean } | null = null;
  const activeTab = tab ?? '';
  try {
    const data = await getServer(permalink, serverId);
    server = data.server;
    const [countsData, queueData, recentData] = await Promise.allSettled([
      getMessageCounts(permalink, serverId),
      getServerQueue(permalink, serverId),
      getMessages(permalink, serverId, '', 1),
    ]);
    if (countsData.status === 'fulfilled') counts = countsData.value;
    if (queueData.status === 'fulfilled') queueMessages = queueData.value.messages ?? [];
    if (recentData.status === 'fulfilled') recentMessages = recentData.value.messages ?? [];
    if (tab === 'limits') {
      const limitsData = await getServerLimits(permalink, serverId);
      limits = limitsData;
    }
  } catch {}

  const usedPercent = limits
    ? Math.round((limits.sent_today / Math.max(limits.send_limit, 1)) * 100)
    : 0;

  const stats = [
    { value: String(counts.incoming), label: 'Incoming', accent: 'cyan' as const, icon: Inbox },
    { value: String(counts.outgoing), label: 'Outgoing', accent: 'green' as const, icon: Send },
    { value: String(counts.held), label: 'Held', accent: 'orange' as const, icon: PauseCircle },
    { value: String(counts.bounced), label: 'Bounces', accent: 'red' as const, icon: Ban },
  ];

  return (
    <OrgLayout orgPermalink={permalink}>
      <div className="animate-fade-in space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <Link
              href={`/organizations/${permalink}`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors mb-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to {permalink}
            </Link>
            <h1 className="text-3xl font-bold tracking-tight gradient-text glow-text">{server.name ?? 'Server'}</h1>
            <div className="page-subtle mt-1">
              <span>ID {server.id}</span>
              <span className="subtle-dot">·</span>
              <Badge variant="outline">{server.mode ?? 'Live'}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/organizations/${permalink}/servers/${serverId}/messages/send-test-form`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Mail className="mr-2 h-4 w-4" /> Send Test
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex gap-1 border-b pb-0 overflow-x-auto scrollbar-hide">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/organizations/${permalink}/servers/${serverId}${t.key ? `?tab=${t.key}` : ''}`}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
              )}
            >
              {t.icon}
              {t.label}
            </Link>
          ))}
        </nav>

        {/* ── Overview ── */}
        {!activeTab && (
          <div className="animate-slide-in-up space-y-6">
            <div className="metric-grid">
              {stats.map((stat) => (
                <Card
                  key={stat.label}
                  className="relative overflow-hidden border-border/60 bg-gradient-to-br from-card to-card/95 transition-all hover:shadow-md hover:border-primary/20"
                >
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                    <div className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ring-1',
                      accentMap[stat.accent]
                    )}>
                      <stat.icon className="h-4 w-4" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold tracking-tight">{stat.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {queueMessages.length > 0 && (
              <Card className="border-border/60 bg-gradient-to-br from-card to-card/95">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">Message Queue</CardTitle>
                    <CardDescription>{queueMessages.length} pending messages</CardDescription>
                  </div>
                  <Link
                    href={`/organizations/${permalink}/servers/${serverId}?tab=queue`}
                    className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1')}
                  >
                    View all <ArrowRight className="h-4 w-4" />
                  </Link>
                </CardHeader>
                <CardContent>
                  <MessageQueueTable messages={queueMessages} permalink={permalink} serverId={serverId} />
                </CardContent>
              </Card>
            )}

            <Card className="border-border/60 bg-gradient-to-br from-card to-card/95">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Recent Messages</CardTitle>
                  <CardDescription>Latest activity across this server</CardDescription>
                </div>
                <Link
                  href={`/organizations/${permalink}/servers/${serverId}/messages`}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1')}
                >
                  View all <ArrowRight className="h-4 w-4" />
                </Link>
              </CardHeader>
              <CardContent>
                {recentMessages.length > 0 ? (
                  <RecentMessagesTable messages={recentMessages} permalink={permalink} serverId={serverId} />
                ) : (
                  <EmptyState
                    icon={<Mail className="h-8 w-8" />}
                    title="No messages yet"
                    description="When your server starts processing messages, they will appear here."
                  />
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Queue ── */}
        {activeTab === 'queue' && (
          <Card className="animate-slide-in-up border-border/60 bg-gradient-to-br from-card to-card/95">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Message Queue</CardTitle>
                <CardDescription>Messages waiting to be delivered</CardDescription>
              </div>
              {queueMessages.length > 0 && <Badge variant="secondary">{queueMessages.length} pending</Badge>}
            </CardHeader>
            <CardContent>
              {queueMessages.length > 0 ? (
                <MessageQueueTable messages={queueMessages} permalink={permalink} serverId={serverId} />
              ) : (
                <EmptyState
                  icon={<Zap className="h-8 w-8" />}
                  title="Queue is empty"
                  description="All messages have been processed."
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Limits tab ── */}
        {activeTab === 'limits' && (
          <div className="animate-slide-in-up space-y-6 max-w-3xl">
            <div className="metric-grid">
              <Card className="border-border/60 bg-gradient-to-br from-card to-card/95">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Sent Today</CardTitle>
                  <div className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ring-1',
                    limits?.exceeded ? accentMap.red : accentMap.green
                  )}>
                    <Send className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight">{limits?.sent_today ?? 0}</div>
                </CardContent>
              </Card>
              <Card className="border-border/60 bg-gradient-to-br from-card to-card/95">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Daily Limit</CardTitle>
                  <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ring-1', accentMap.cyan)}>
                    <Inbox className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight">{limits?.send_limit ?? 0}</div>
                </CardContent>
              </Card>
              <Card className="border-border/60 bg-gradient-to-br from-card to-card/95">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Used</CardTitle>
                  <div className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ring-1',
                    usedPercent > 90 ? accentMap.red : usedPercent > 75 ? accentMap.orange : accentMap.green
                  )}>
                    <Activity className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight">{usedPercent}%</div>
                </CardContent>
              </Card>
            </div>

            {limits && (
              <Card className="border-border/60 bg-gradient-to-br from-card to-card/95">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Daily Usage</CardTitle>
                  <CardDescription>
                    {limits.sent_today} of {limits.send_limit} messages sent today
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(usedPercent, 100)}%`,
                        background: usedPercent > 90
                          ? 'linear-gradient(90deg, var(--color-accent-red), var(--color-accent-orange))'
                          : usedPercent > 75
                            ? 'linear-gradient(90deg, var(--color-accent-orange), var(--color-accent-green))'
                            : 'linear-gradient(90deg, var(--color-accent-green), var(--color-accent-cyan))',
                      }}
                    />
                  </div>
                  {limits.exceeded && <div className="alert alert-error">Daily send limit has been exceeded.</div>}
                  {limits.approaching && !limits.exceeded && <div className="alert alert-info">Approaching daily send limit.</div>}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Spam tab ── */}
        {activeTab === 'spam' && (
          <Card className="animate-slide-in-up border-border/60 bg-gradient-to-br from-card to-card/95 max-w-xl">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Spam Settings</CardTitle>
              <CardDescription>Current spam detection thresholds for this server</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                  <div className="text-sm text-muted-foreground mb-1">Spam Threshold</div>
                  <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                    {server.spam_threshold != null ? server.spam_threshold : 'Not set'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Messages above this are flagged as spam.</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                  <div className="text-sm text-muted-foreground mb-1">Spam Failure Threshold</div>
                  <div className="text-3xl font-bold text-rose-600 dark:text-rose-400">
                    {server.spam_failure_threshold != null ? server.spam_failure_threshold : 'Not set'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Messages above this are rejected entirely.</p>
                </div>
              </div>
              <Link
                href={`/organizations/${permalink}/servers/${serverId}?tab=settings`}
                className={buttonVariants({ variant: 'outline' })}
              >
                Edit thresholds <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        )}

        {/* ── Settings tab ── */}
        {activeTab === 'settings' && (
          <Card className="animate-slide-in-up border-border/60 bg-gradient-to-br from-card to-card/95 max-w-2xl">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Server Settings</CardTitle>
              <CardDescription>Update delivery, spam, and retention settings</CardDescription>
            </CardHeader>
            <CardContent>
              <ServerSettingsForm orgPermalink={permalink} serverId={serverId} server={server} />
            </CardContent>
          </Card>
        )}
      </div>
    </OrgLayout>
  );
}

function MessageQueueTable({ messages, permalink, serverId }: { messages: any[]; permalink: string; serverId: string }) {
  return (
    <div className="overflow-x-auto -mx-6 px-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wider">
            <th className="pb-3 font-medium">ID</th>
            <th className="pb-3 font-medium">Domain</th>
            <th className="pb-3 font-medium">Attempts</th>
            <th className="pb-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {messages.map((msg: any) => (
            <tr key={msg.id} className="group">
              <td className="py-3">
                {msg.message_id ? (
                  <Link
                    href={`/organizations/${permalink}/servers/${serverId}/messages/${msg.message_id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {msg.message_id}
                  </Link>
                ) : (
                  msg.id
                )}
              </td>
              <td className="py-3 text-muted-foreground">{msg.domain ?? '-'}</td>
              <td className="py-3 text-muted-foreground">{msg.attempts ?? '-'}</td>
              <td className="py-3">
                <Badge variant={msg.locked_by ? 'secondary' : 'outline'}>
                  {msg.locked_by ? 'Processing' : 'Queued'}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentMessagesTable({ messages, permalink, serverId }: { messages: any[]; permalink: string; serverId: string }) {
  return (
    <div className="overflow-x-auto -mx-6 px-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wider">
            <th className="pb-3 font-medium">ID</th>
            <th className="pb-3 font-medium">Status</th>
            <th className="pb-3 font-medium">From</th>
            <th className="pb-3 font-medium">To</th>
            <th className="pb-3 font-medium">Subject</th>
            <th className="pb-3 font-medium">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {messages.map((msg: any) => (
            <tr key={msg.id}>
              <td className="py-3">
                <Link
                  href={`/organizations/${permalink}/servers/${serverId}/messages/${msg.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {msg.id}
                </Link>
              </td>
              <td className="py-3">
                <Badge
                  variant={
                    msg.status === 'Sent'
                      ? 'default'
                      : msg.status === 'Held'
                        ? 'secondary'
                        : 'destructive'
                  }
                >
                  {msg.status ?? '-'}
                </Badge>
              </td>
              <td className="py-3 text-muted-foreground">{msg.mail_from ?? '-'}</td>
              <td className="py-3 text-muted-foreground">{msg.rcpt_to ?? '-'}</td>
              <td className="py-3 text-muted-foreground">{msg.subject ?? '-'}</td>
              <td className="py-3 text-muted-foreground text-xs">
                {msg.timestamp ? new Date(msg.timestamp * 1000).toLocaleString() : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/20 mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mt-1">{description}</p>
    </div>
  );
}

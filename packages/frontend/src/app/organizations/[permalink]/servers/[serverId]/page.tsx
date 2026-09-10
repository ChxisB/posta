import { Inbox, Mail, Zap } from 'lucide-react';
import {
  getServer,
  getServerLimits,
  getServerQueue,
  getMessageCounts,
  getMessages,
} from '@/lib/api';
import ServerSettingsForm from './server-settings-form';
import { PageHeader } from '@/components/ui/page-header';
import { BackLink } from '@/components/ui/back-link';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { FlagPill, KindTag, MessageStatusPill } from '@/components/ui/pill';
import { TabNav } from '@/components/ui/tab-nav';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface QueueMessage {
  id: number;
  message_id?: number;
  domain?: string;
  attempts?: number;
  locked_by?: string | null;
}

interface Message {
  id: number;
  status?: string;
  mail_from?: string;
  rcpt_to?: string;
  subject?: string;
  /** Unix seconds, not milliseconds. */
  timestamp?: number;
}

interface Limits {
  send_limit: number;
  sent_today: number;
  approaching: boolean;
  exceeded: boolean;
}

const TAB_KEYS = ['', 'queue', 'limits', 'spam', 'settings'] as const;
type TabKey = (typeof TAB_KEYS)[number];

function formatTime(seconds?: number): string {
  if (!seconds) return '—';
  return new Date(seconds * 1000).toLocaleString();
}

export default async function ServerDetailPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ permalink: string; serverId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { permalink, serverId } = await paramsPromise;
  const { tab } = await searchParamsPromise;

  const base = `/organizations/${permalink}/servers/${serverId}`;
  const activeTab: TabKey = (TAB_KEYS as readonly string[]).includes(tab ?? '')
    ? ((tab ?? '') as TabKey)
    : '';

  // The server record is the page: without it there is nothing to render a
  // tab for, so it is awaited separately from the panel data.
  let server: Record<string, unknown> = {};
  try {
    server = (await getServer(permalink, serverId)).server;
  } catch (err) {
    return (
      <>
        <PageHeader
          breadcrumb={<BackLink href={`/organizations/${permalink}`}>{permalink}</BackLink>}
          title="Server"
        />
        <Card>
          <ErrorState error={err} what="this server" retryHref={base} />
        </Card>
      </>
    );
  }

  const [countsResult, queueResult, recentResult, limitsResult] = await Promise.allSettled([
    getMessageCounts(permalink, serverId),
    getServerQueue(permalink, serverId),
    getMessages(permalink, serverId, '', 1),
    // Only fetched for the tab that shows it: the endpoint is comparatively
    // expensive and no other tab reads the result.
    activeTab === 'limits' ? getServerLimits(permalink, serverId) : Promise.resolve(null),
  ]);

  const counts =
    countsResult.status === 'fulfilled'
      ? countsResult.value
      : { incoming: 0, outgoing: 0, held: 0, bounced: 0 };
  const queueMessages: QueueMessage[] =
    queueResult.status === 'fulfilled' ? (queueResult.value.messages ?? []) : [];
  const recentMessages: Message[] =
    recentResult.status === 'fulfilled' ? (recentResult.value.messages ?? []) : [];
  const limits: Limits | null =
    limitsResult.status === 'fulfilled' ? (limitsResult.value as Limits | null) : null;

  const mode = (server.mode as string) ?? 'Live';

  const queueColumns: Column<QueueMessage>[] = [
    {
      key: 'id',
      header: 'Message',
      primary: true,
      cell: (m) => <KindTag>{m.message_id ?? m.id}</KindTag>,
    },
    {
      key: 'domain',
      header: 'Domain',
      cell: (m) => <span className="text-muted">{m.domain ?? '—'}</span>,
    },
    {
      key: 'attempts',
      header: 'Attempts',
      cell: (m) => <span className="tabular-nums text-muted">{m.attempts ?? 0}</span>,
    },
    {
      key: 'status',
      header: 'State',
      cell: (m) => <FlagPill on={!!m.locked_by} onLabel="Processing" offLabel="Queued" />,
    },
  ];

  const messageColumns: Column<Message>[] = [
    { key: 'id', header: 'ID', primary: true, cell: (m) => <KindTag>{m.id}</KindTag> },
    { key: 'status', header: 'Status', cell: (m) => <MessageStatusPill status={m.status ?? ''} /> },
    {
      key: 'from',
      header: 'From',
      cell: (m) => <span className="text-muted">{m.mail_from ?? '—'}</span>,
    },
    {
      key: 'to',
      header: 'To',
      cell: (m) => <span className="text-muted">{m.rcpt_to ?? '—'}</span>,
    },
    {
      key: 'subject',
      header: 'Subject',
      className: 'max-w-xs truncate',
      cell: (m) => <span className="text-muted">{m.subject ?? '—'}</span>,
    },
    {
      key: 'time',
      header: 'Time',
      cell: (m) => <span className="text-xs text-faint">{formatTime(m.timestamp)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={<BackLink href={`/organizations/${permalink}`}>{permalink}</BackLink>}
        title={(server.name as string) ?? 'Server'}
        description={
          mode === 'Development'
            ? 'In development mode: messages are accepted and recorded but never delivered.'
            : 'Live: messages sent through this server are delivered to real recipients.'
        }
        actions={
          <>
            <FlagPill on={mode === 'Live'} onLabel="Live" offLabel={mode} />
            <ButtonLink href={`${base}/messages`} variant="secondary">
              <Mail size={15} aria-hidden /> Messages
            </ButtonLink>
          </>
        }
      />

      <TabNav
        ariaLabel="Server sections"
        tabs={TAB_KEYS.map((key) => ({
          href: key ? `${base}?tab=${key}` : base,
          label: key ? key[0].toUpperCase() + key.slice(1) : 'Overview',
        }))}
      />

      {countsResult.status === 'rejected' && activeTab === '' && (
        <Callout tone="warning" title="Message counts unavailable">
          The server loaded, but its message-count endpoint did not respond.
        </Callout>
      )}

      {activeTab === '' && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Incoming" value={counts.incoming} />
            <StatCard
              label="Outgoing"
              value={counts.outgoing}
              tone={counts.outgoing > 0 ? 'green' : 'default'}
            />
            <StatCard
              label="Held"
              value={counts.held}
              tone={counts.held > 0 ? 'orange' : 'default'}
            />
            <StatCard
              label="Bounced"
              value={counts.bounced}
              tone={counts.bounced > 0 ? 'red' : 'default'}
            />
          </div>

          {queueMessages.length > 0 && (
            <Card>
              <CardHeader
                title="Queue"
                description={`${queueMessages.length} message${queueMessages.length === 1 ? '' : 's'} waiting to be delivered.`}
                action={
                  <ButtonLink href={`${base}?tab=queue`} variant="ghost" size="sm">
                    View all
                  </ButtonLink>
                }
              />
              <div className="px-6 pb-1">
                <DataTable
                  rows={queueMessages.slice(0, 5)}
                  columns={queueColumns}
                  getRowKey={(m) => String(m.id)}
                />
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Recent messages"
              description="The latest activity through this server."
              action={
                <ButtonLink href={`${base}/messages`} variant="ghost" size="sm">
                  View all
                </ButtonLink>
              }
            />
            <div className="px-6 pb-1">
              <DataTable
                rows={recentMessages}
                columns={messageColumns}
                getRowKey={(m) => String(m.id)}
                rowHref={(m) => `${base}/messages/${m.id}`}
                getRowLabel={(m) => `Message ${m.id} to ${m.rcpt_to ?? 'unknown recipient'}`}
                error={
                  recentResult.status === 'rejected' ? (
                    <ErrorState
                      error={recentResult.reason}
                      what="recent messages"
                      retryHref={base}
                    />
                  ) : undefined
                }
                empty={
                  <EmptyState
                    icon={Mail}
                    title="No messages yet"
                    description="Once this server processes its first message it will appear here."
                  />
                }
              />
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'queue' && (
        <Card>
          <CardHeader
            title="Queue"
            description="Messages accepted but not yet delivered. Posta retries these on a backoff."
          />
          <div className="px-6 pb-1">
            <DataTable
              rows={queueMessages}
              columns={queueColumns}
              getRowKey={(m) => String(m.id)}
              error={
                queueResult.status === 'rejected' ? (
                  <ErrorState
                    error={queueResult.reason}
                    what="the queue"
                    retryHref={`${base}?tab=queue`}
                  />
                ) : undefined
              }
              empty={
                <EmptyState
                  icon={Zap}
                  title="Queue is empty"
                  description="Everything accepted so far has been delivered or has stopped retrying."
                />
              }
            />
          </div>
        </Card>
      )}

      {activeTab === 'limits' && <LimitsPanel limits={limits} base={base} result={limitsResult} />}

      {activeTab === 'spam' && (
        <Card className="max-w-2xl">
          <CardHeader
            title="Spam thresholds"
            description="Scores come from the spam checker. A higher score means more spam-like."
          />
          <CardBody className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Threshold
                label="Flag threshold"
                value={server.spam_threshold as number | null}
                hint="Messages at or above this score are marked as spam but still delivered."
                tone="amber"
              />
              <Threshold
                label="Reject threshold"
                value={server.spam_failure_threshold as number | null}
                hint="Messages at or above this score are rejected outright and never delivered."
                tone="red"
              />
            </div>
            <div>
              <ButtonLink href={`${base}?tab=settings`} variant="secondary" size="sm">
                Edit thresholds
              </ButtonLink>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'settings' && (
        <Card className="max-w-2xl">
          <CardHeader
            title="Server settings"
            description="Delivery, spam and retention behaviour."
          />
          <CardBody>
            <ServerSettingsForm orgPermalink={permalink} serverId={serverId} server={server} />
          </CardBody>
        </Card>
      )}
    </>
  );
}

function Threshold({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | null | undefined;
  hint: string;
  tone: 'amber' | 'red';
}) {
  return (
    <div className="rounded-xl border border-line bg-panel-2 p-4">
      <p className="text-2xs font-semibold tracking-wide text-faint uppercase">{label}</p>
      <p
        className={cn(
          'mt-1.5 text-3xl font-semibold tabular-nums',
          value == null ? 'text-faint' : tone === 'amber' ? 'text-amber' : 'text-red',
        )}
      >
        {value ?? 'Not set'}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

function LimitsPanel({
  limits,
  base,
  result,
}: {
  limits: Limits | null;
  base: string;
  result: PromiseSettledResult<unknown>;
}) {
  if (result.status === 'rejected') {
    return (
      <Card>
        <ErrorState
          error={result.reason}
          what="this server's send limits"
          retryHref={`${base}?tab=limits`}
        />
      </Card>
    );
  }

  if (!limits) {
    return (
      <Card>
        <EmptyState
          icon={Inbox}
          title="No send limit configured"
          description="This server sends without a daily cap. Set one in Settings if you want a ceiling."
        />
      </Card>
    );
  }

  const usedPercent = Math.round((limits.sent_today / Math.max(limits.send_limit, 1)) * 100);
  const tone = limits.exceeded ? 'red' : usedPercent > 75 ? 'amber' : 'green';

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Sent today"
          value={limits.sent_today}
          tone={limits.exceeded ? 'red' : 'green'}
        />
        <StatCard label="Daily limit" value={limits.send_limit} />
        <StatCard label="Used" value={`${usedPercent}%`} tone={tone} />
      </div>

      <Card>
        <CardHeader
          title="Daily usage"
          description={`${limits.sent_today} of ${limits.send_limit} messages sent today.`}
        />
        <CardBody className="flex flex-col gap-4">
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-panel-2"
            role="progressbar"
            aria-valuenow={limits.sent_today}
            aria-valuemin={0}
            aria-valuemax={limits.send_limit}
            aria-label="Daily send limit used"
          >
            <div
              className={cn(
                'h-full rounded-full',
                tone === 'red' ? 'bg-red' : tone === 'amber' ? 'bg-amber' : 'bg-green',
              )}
              style={{ width: `${Math.min(usedPercent, 100)}%` }}
            />
          </div>

          {limits.exceeded && (
            <Callout tone="danger" title="Daily send limit exceeded">
              Further messages are being rejected until the counter resets. Raise the limit in
              Settings if this server legitimately needs to send more.
            </Callout>
          )}
          {limits.approaching && !limits.exceeded && (
            <Callout tone="warning" title="Approaching the daily send limit">
              At {usedPercent}% of the daily allowance. Messages will be rejected once it is
              reached.
            </Callout>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

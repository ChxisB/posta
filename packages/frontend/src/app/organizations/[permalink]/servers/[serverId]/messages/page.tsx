import Link from 'next/link';
import { Mail } from 'lucide-react';
import { getMessages } from '@/lib/api';
import SendTestForm from './send-test-form';
import { PageHeader } from '@/components/ui/page-header';
import { BackLink } from '@/components/ui/back-link';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { KindTag, MessageStatusPill } from '@/components/ui/pill';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Message {
  id: number;
  status?: string;
  mail_from?: string;
  rcpt_to?: string;
  subject?: string;
  /** Unix seconds, not milliseconds. */
  timestamp?: number;
}

const SCOPES = [
  { id: '', label: 'All' },
  { id: 'incoming', label: 'Incoming' },
  { id: 'outgoing', label: 'Outgoing' },
  { id: 'held', label: 'Held' },
];

/**
 * First page, last page, and a window around the current one. Without this a
 * server with thousands of messages renders one page link per page.
 */
function pageNumbers(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | 'gap')[] = [1];
  if (current > 3) pages.push('gap');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push('gap');
  pages.push(total);
  return pages;
}

export default async function MessagesPage({
  params: p,
  searchParams: sp,
}: {
  params: Promise<{ permalink: string; serverId: string }>;
  searchParams: Promise<{ scope?: string; page?: string }>;
}) {
  const { permalink, serverId } = await p;
  const { scope, page } = await sp;

  const base = `/organizations/${permalink}/servers/${serverId}`;
  const currentPage = Math.max(parseInt(page ?? '1', 10) || 1, 1);
  const activeScope = scope ?? '';

  let messages: Message[] = [];
  let totalPages = 1;
  let error: unknown = null;
  try {
    const data = await getMessages(permalink, serverId, activeScope, currentPage);
    messages = data.messages;
    totalPages = data.total_pages;
  } catch (err) {
    error = err;
  }

  const columns: Column<Message>[] = [
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
      cell: (m) => (
        <span className="text-xs whitespace-nowrap text-faint">
          {m.timestamp ? new Date(m.timestamp * 1000).toLocaleString() : '—'}
        </span>
      ),
    },
  ];

  const scopeHref = (id: string) => `${base}/messages${id ? `?scope=${id}` : ''}`;

  return (
    <>
      <PageHeader
        breadcrumb={<BackLink href={base}>Server</BackLink>}
        title="Messages"
        description="Every message this server has accepted, in or out. Open one to see its full delivery history."
      />

      {/* Links rather than buttons: each scope is a real, shareable URL, and
          this page renders on the server. */}
      <nav aria-label="Filter messages" className="flex flex-wrap gap-2">
        {SCOPES.map((s) => {
          const active = activeScope === s.id;
          return (
            <Link
              key={s.id || 'all'}
              href={scopeHref(s.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors',
                active
                  ? 'border-accent bg-accent/10 font-medium text-accent'
                  : 'border-line bg-panel text-muted hover:bg-panel-2 hover:text-foreground',
              )}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>

      <SendTestForm permalink={permalink} serverId={serverId} />

      <Card className="mt-5">
        <div className="px-6 pb-1">
          <DataTable
            rows={messages}
            columns={columns}
            getRowKey={(m) => String(m.id)}
            rowHref={(m) => `${base}/messages/${m.id}`}
            getRowLabel={(m) => `Message ${m.id} to ${m.rcpt_to ?? 'unknown recipient'}`}
            error={
              error ? (
                <ErrorState
                  error={error}
                  what="these messages"
                  retryHref={scopeHref(activeScope)}
                />
              ) : undefined
            }
            empty={
              <EmptyState
                icon={Mail}
                title={activeScope ? `No ${activeScope} messages` : 'No messages yet'}
                description={
                  activeScope
                    ? 'Nothing matches this filter. Try All, or send a test message above.'
                    : 'Send a test message above to confirm the server is delivering.'
                }
              />
            }
          />
        </div>

        {totalPages > 1 && !error && (
          <nav
            aria-label="Pagination"
            className="flex flex-wrap items-center justify-center gap-1.5 border-t border-line-soft px-5 py-4"
          >
            {pageNumbers(currentPage, totalPages).map((n, i) =>
              n === 'gap' ? (
                <span key={`gap-${i}`} aria-hidden className="px-2 text-xs text-faint">
                  …
                </span>
              ) : (
                <Link
                  key={n}
                  href={`${base}/messages?scope=${activeScope}&page=${n}`}
                  aria-current={currentPage === n ? 'page' : undefined}
                  aria-label={`Page ${n}`}
                  className={cn(
                    'inline-grid h-8 min-w-8 place-items-center rounded-lg px-2 text-xs tabular-nums transition-colors',
                    currentPage === n
                      ? 'bg-accent font-semibold text-accent-ink'
                      : 'border border-line bg-panel text-muted hover:bg-panel-2 hover:text-foreground',
                  )}
                >
                  {n}
                </Link>
              ),
            )}
          </nav>
        )}
      </Card>
    </>
  );
}

import { FileWarning, Inbox } from 'lucide-react';
import {
  getMessage,
  getMessagePlain,
  getMessageHtml,
  getMessageHeaders,
  getMessageAttachments,
} from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { BackLink } from '@/components/ui/back-link';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Callout } from '@/components/ui/callout';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { MessageStatusPill } from '@/components/ui/pill';
import { TabNav } from '@/components/ui/tab-nav';

export const dynamic = 'force-dynamic';

const VIEWS = [
  { key: '', label: 'Details' },
  { key: 'plain', label: 'Plain text' },
  { key: 'html', label: 'HTML' },
  { key: 'headers', label: 'Headers' },
  { key: 'attachments', label: 'Attachments' },
];

interface Attachment {
  id?: number;
  name?: string;
  content_type?: string;
  size?: number;
}

export default async function MessageDetailPage({
  params: p,
  searchParams: sp,
}: {
  params: Promise<{ permalink: string; serverId: string; messageId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { permalink, serverId, messageId } = await p;
  const { view } = await sp;

  const base = `/organizations/${permalink}/servers/${serverId}`;
  const self = `${base}/messages/${messageId}`;

  let msg: Record<string, unknown> = {};
  let loadError: unknown = null;
  try {
    msg = (await getMessage(permalink, serverId, messageId)).message;
  } catch (err) {
    loadError = err;
  }

  const heading = (
    <PageHeader
      breadcrumb={<BackLink href={`${base}/messages`}>Messages</BackLink>}
      title={`Message ${messageId}`}
      description={(msg.subject as string) || undefined}
      actions={!loadError ? <MessageStatusPill status={(msg.status as string) ?? ''} /> : undefined}
    />
  );

  if (loadError) {
    return (
      <>
        {heading}
        <Card>
          <ErrorState error={loadError} what="this message" retryHref={self} />
        </Card>
      </>
    );
  }

  return (
    <>
      {heading}

      <TabNav
        ariaLabel="Message views"
        tabs={VIEWS.map((v) => ({ href: v.key ? `${self}?view=${v.key}` : self, label: v.label }))}
      />

      {!view && <Details msg={msg} />}
      {view === 'plain' && (
        <PlainView permalink={permalink} serverId={serverId} messageId={messageId} />
      )}
      {view === 'html' && (
        <HtmlView permalink={permalink} serverId={serverId} messageId={messageId} />
      )}
      {view === 'headers' && (
        <HeadersView permalink={permalink} serverId={serverId} messageId={messageId} />
      )}
      {view === 'attachments' && (
        <AttachmentsView permalink={permalink} serverId={serverId} messageId={messageId} />
      )}
    </>
  );
}

function Details({ msg }: { msg: Record<string, unknown> }) {
  const rows: [string, React.ReactNode][] = [
    ['From', (msg.mail_from as string) ?? '—'],
    ['To', (msg.rcpt_to as string) ?? '—'],
    ['Subject', (msg.subject as string) ?? '—'],
    ['Direction', (msg.scope as string) ?? '—'],
    ['Received', msg.timestamp ? new Date((msg.timestamp as number) * 1000).toLocaleString() : '—'],
    ['Size', msg.size ? `${msg.size} bytes` : '—'],
  ];

  return (
    <Card className="max-w-2xl">
      <CardHeader title="Details" />
      <CardBody>
        <dl className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-5 gap-y-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="min-w-0 break-words text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}

async function PlainView({
  permalink,
  serverId,
  messageId,
}: {
  permalink: string;
  serverId: string;
  messageId: string;
}) {
  let body = '';
  let error: unknown = null;
  try {
    body = (await getMessagePlain(permalink, serverId, messageId)).body ?? '';
  } catch (err) {
    error = err;
  }

  return (
    <Card>
      <CardHeader title="Plain text body" />
      <CardBody>
        {error ? (
          <ErrorState error={error} what="the plain text body" />
        ) : body ? (
          <pre className="overflow-x-auto text-xs leading-relaxed whitespace-pre-wrap text-foreground">
            {body}
          </pre>
        ) : (
          <EmptyState
            title="No plain text part"
            description="This message was sent as HTML only."
          />
        )}
      </CardBody>
    </Card>
  );
}

async function HtmlView({
  permalink,
  serverId,
  messageId,
}: {
  permalink: string;
  serverId: string;
  messageId: string;
}) {
  let body = '';
  let error: unknown = null;
  try {
    body = (await getMessageHtml(permalink, serverId, messageId)).body ?? '';
  } catch (err) {
    error = err;
  }

  return (
    <Card>
      <CardHeader
        title="HTML body"
        description="Rendered in an isolated frame with scripts and network access disabled."
      />
      <CardBody>
        {error ? (
          <ErrorState error={error} what="the HTML body" />
        ) : body ? (
          <>
            <Callout tone="warning" className="mb-4">
              This is the sender&apos;s own markup, shown without scripts, forms or remote content,
              so it may not look exactly as the recipient sees it.
            </Callout>
            {/*
              A sandboxed iframe, not dangerouslySetInnerHTML.

              This body is attacker-controlled: anyone who can send mail to a
              routed address decides what is in it. Injecting it into the
              dashboard's own document, which is what this page used to do,
              made every inbound message a stored-XSS vector against the
              operator's authenticated session.

              `sandbox` with no allow-tokens blocks scripts, form submission,
              popups and same-origin access; srcDoc keeps it off the network.
            */}
            <iframe
              title="Message HTML body"
              sandbox=""
              srcDoc={body}
              className="h-[32rem] w-full rounded-lg border border-line bg-white"
            />
          </>
        ) : (
          <EmptyState
            title="No HTML part"
            description="This message was sent as plain text only."
          />
        )}
      </CardBody>
    </Card>
  );
}

async function HeadersView({
  permalink,
  serverId,
  messageId,
}: {
  permalink: string;
  serverId: string;
  messageId: string;
}) {
  let headers: Record<string, string[]> = {};
  let error: unknown = null;
  try {
    headers = (await getMessageHeaders(permalink, serverId, messageId)).headers ?? {};
  } catch (err) {
    error = err;
  }

  const entries = Object.entries(headers);

  return (
    <Card>
      <CardHeader
        title="Headers"
        description="Useful for tracing what each hop did with the message."
      />
      <CardBody>
        {error ? (
          <ErrorState error={error} what="the headers" />
        ) : entries.length === 0 ? (
          <EmptyState title="No headers recorded" />
        ) : (
          <dl className="grid grid-cols-[minmax(0,14rem)_1fr] gap-x-5 gap-y-2.5 font-mono text-xs">
            {entries.map(([key, values]) => (
              <div key={key} className="contents">
                <dt className="break-all text-muted">{key}</dt>
                <dd className="min-w-0 break-all text-foreground">{values.join(', ')}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardBody>
    </Card>
  );
}

async function AttachmentsView({
  permalink,
  serverId,
  messageId,
}: {
  permalink: string;
  serverId: string;
  messageId: string;
}) {
  let attachments: Attachment[] = [];
  let error: unknown = null;
  try {
    attachments = (await getMessageAttachments(permalink, serverId, messageId)).attachments ?? [];
  } catch (err) {
    error = err;
  }

  return (
    <Card>
      <CardHeader title="Attachments" />
      {error ? (
        <CardBody>
          <ErrorState error={error} what="the attachments" />
        </CardBody>
      ) : attachments.length === 0 ? (
        <CardBody>
          <EmptyState icon={Inbox} title="No attachments" />
        </CardBody>
      ) : (
        <ul className="divide-y divide-line-soft">
          {attachments.map((a) => (
            <li key={a.id ?? a.name} className="flex items-center gap-3 px-6 py-3.5">
              <FileWarning size={16} className="shrink-0 text-faint" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {a.name ?? 'Unnamed'}
                </p>
                <p className="font-mono text-2xs text-faint">{a.content_type ?? 'unknown type'}</p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {a.size != null ? `${a.size} bytes` : '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import {
  getMessage,
  getMessagePlain,
  getMessageHtml,
  getMessageHeaders,
  getMessageAttachments,
} from '@/lib/api';
export const dynamic = 'force-dynamic';

export default async function MessageDetailPage({
  params: p,
  searchParams: sp,
}: {
  params: Promise<{ permalink: string; serverId: string; messageId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { permalink, serverId, messageId } = await p;
  const { view } = await sp;
  let msg: any = {};
  try {
    const data = await getMessage(permalink, serverId, messageId);
    msg = data.message;
  } catch {}

  const statusColor: Record<string, string> = { Sent: 'green', Held: 'yellow', SoftFail: 'yellow', HardFail: 'red', Bounced: 'red' };

  let subView: { title: string; content: React.ReactNode } | null = null;

  if (view === 'plain') {
    let body = '';
    try {
      const data = await getMessagePlain(permalink, serverId, messageId);
      body = data.body ?? '';
    } catch {}
    subView = {
      title: 'Plain Text Body',
      content: body ? (
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, margin: 0 }}>{body}</pre>
      ) : (
        <p style={{ color: 'var(--color-text-muted)' }}>No plain text body available.</p>
      ),
    };
  } else if (view === 'html') {
    let body = '';
    try {
      const data = await getMessageHtml(permalink, serverId, messageId);
      body = data.body ?? '';
    } catch {}
    subView = {
      title: 'HTML Body',
      content: body ? (
        <div dangerouslySetInnerHTML={{ __html: body }} />
      ) : (
        <p style={{ color: 'var(--color-text-muted)' }}>No HTML body available.</p>
      ),
    };
  } else if (view === 'headers') {
    let headers: Record<string, string[]> = {};
    try {
      const data = await getMessageHeaders(permalink, serverId, messageId);
      headers = data.headers ?? {};
    } catch {}
    const entries = Object.entries(headers);
    subView = {
      title: 'Headers',
      content: entries.length > 0 ? (
        <table className="table">
          <thead><tr><th>Header</th><th>Values</th></tr></thead>
          <tbody>
            {entries.map(([key, values]) => (
              <tr key={key}>
                <td style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{key}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{values.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: 'var(--color-text-muted)' }}>No headers available.</p>
      ),
    };
  } else if (view === 'attachments') {
    let attachments: any[] = [];
    try {
      const data = await getMessageAttachments(permalink, serverId, messageId);
      attachments = data.attachments ?? [];
    } catch {}
    subView = {
      title: 'Attachments',
      content: attachments.length > 0 ? (
        <table className="table">
          <thead><tr><th>Name</th><th>Type</th><th>Size</th></tr></thead>
          <tbody>
            {attachments.map((a: any) => (
              <tr key={a.id ?? a.name}>
                <td>{a.name ?? '-'}</td>
                <td style={{ color: 'var(--color-text-muted)' }}>{a.content_type ?? '-'}</td>
                <td style={{ color: 'var(--color-text-muted)' }}>{a.size ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: 'var(--color-text-muted)' }}>No attachments.</p>
      ),
    };
  }

  return (
    <OrgLayout orgPermalink={permalink}>
      <Link href={`/organizations/${permalink}/servers/${serverId}/messages`}
        style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 16, display: 'inline-block' }}>
        ← Back to Messages
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Message #{messageId}</h1>
      <span className={`tag tag-${statusColor[msg.status] ?? 'gray'}`} style={{ marginBottom: 24, display: 'inline-block' }}>{msg.status ?? 'Unknown'}</span>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-muted)' }}>Details</h3>
          <dl style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 16px', fontSize: 14 }}>
            <dt style={{ color: 'var(--color-text-muted)' }}>From</dt><dd>{msg.mail_from ?? '-'}</dd>
            <dt style={{ color: 'var(--color-text-muted)' }}>To</dt><dd>{msg.rcpt_to ?? '-'}</dd>
            <dt style={{ color: 'var(--color-text-muted)' }}>Subject</dt><dd>{msg.subject ?? '-'}</dd>
            <dt style={{ color: 'var(--color-text-muted)' }}>Direction</dt><dd>{msg.scope ?? '-'}</dd>
            <dt style={{ color: 'var(--color-text-muted)' }}>Time</dt><dd>{msg.timestamp ? new Date(msg.timestamp * 1000).toLocaleString() : '-'}</dd>
            <dt style={{ color: 'var(--color-text-muted)' }}>Size</dt><dd>{msg.size ?? '-'}</dd>
          </dl>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-muted)' }}>Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link href={`/organizations/${permalink}/servers/${serverId}/messages/${messageId}?view=plain`} className="btn">View Plain Text</Link>
            <Link href={`/organizations/${permalink}/servers/${serverId}/messages/${messageId}?view=html`} className="btn">View HTML</Link>
            <Link href={`/organizations/${permalink}/servers/${serverId}/messages/${messageId}?view=headers`} className="btn">View Headers</Link>
            <Link href={`/organizations/${permalink}/servers/${serverId}/messages/${messageId}?view=attachments`} className="btn">Attachments</Link>
          </div>
        </div>
      </div>

      {subView && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-muted)' }}>{subView.title}</h3>
          {subView.content}
        </div>
      )}

      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-muted)' }}>Delivery Attempts</h3>
        <table className="table">
          <thead><tr><th>Status</th><th>Details</th><th>Time</th></tr></thead>
          <tbody><tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 16 }}>No delivery attempts</td></tr></tbody>
        </table>
      </div>
    </OrgLayout>
  );
}

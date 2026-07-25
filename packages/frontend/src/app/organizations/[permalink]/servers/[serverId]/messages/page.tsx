import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { getMessages } from '@/lib/api';
import SendTestForm from './send-test-form';
export const dynamic = 'force-dynamic';

export default async function MessagesPage({
  params: p, searchParams: sp,
}: { params: Promise<{ permalink: string; serverId: string }>; searchParams: Promise<{ scope?: string; page?: string }> }) {
  const { permalink, serverId } = await p;
  const { scope, page } = await sp;
  let messages: any[] = [];
  let totalPages = 1;
  let currentPage = parseInt(page ?? '1', 10);
  try {
    const data = await getMessages(permalink, serverId, scope ?? '', currentPage);
    messages = data.messages;
    totalPages = data.total_pages;
  } catch {}

  const scopes = [
    { id: '', label: 'All' },
    { id: 'incoming', label: 'Incoming' },
    { id: 'outgoing', label: 'Outgoing' },
    { id: 'held', label: 'Held' },
  ];

  // Smart pagination: show first, last, current±2, ellipsis
  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  return (
    <OrgLayout orgPermalink={permalink}>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <div className="back-link">
              <Link href={`/organizations/${permalink}/servers/${serverId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                &larr; Server
              </Link>
            </div>
            <h1 className="page-title">Messages</h1>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {scopes.map((s) => {
            const isActive = (scope === s.id) || (!scope && !s.id);
            return (
              <Link key={s.id} href={`/organizations/${permalink}/servers/${serverId}/messages?scope=${s.id}`}
                className={`btn btn-sm${isActive ? ' btn-primary' : ''}`}>
                {s.label}
              </Link>
            );
          })}
        </div>

        <SendTestForm permalink={permalink} serverId={serverId} />

        <div className="card">
          {messages.length > 0 ? (
            <div className="table-container">
              <table className="table">
                <thead><tr><th>ID</th><th>Status</th><th>From</th><th>To</th><th>Subject</th><th>Time</th></tr></thead>
                <tbody>
                  {messages.map((msg: any) => (
                    <tr key={msg.id}>
                      <td>
                        <Link href={`/organizations/${permalink}/servers/${serverId}/messages/${msg.id}`}
                          style={{ color: 'var(--color-accent)' }}>{msg.id}</Link>
                      </td>
                      <td>
                        <span className={`tag ${
                          msg.status === 'Sent' ? 'tag-green' : msg.status === 'Held' ? 'tag-yellow' : 'tag-red'
                        }`}>{msg.status ?? '-'}</span>
                      </td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{msg.mail_from ?? '-'}</td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{msg.rcpt_to ?? '-'}</td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{msg.subject ?? '-'}</td>
                      <td style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                        {msg.timestamp ? new Date(msg.timestamp * 1000).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">✉️</div>
              <div className="empty-state-title">No messages found</div>
              <div className="empty-state-text">Try changing the scope filter or check back later.</div>
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', padding: 16 }}>
              {getPageNumbers().map((p, i) => {
                if (p === '...') return <span key={`e${i}`} style={{ padding: '6px 10px', color: 'var(--color-text-muted)' }}>…</span>;
                return (
                  <Link key={p} href={`/organizations/${permalink}/servers/${serverId}/messages?scope=${scope ?? ''}&page=${p}`}
                    className={`btn btn-sm${currentPage === p ? ' btn-primary' : ''}`}>{p}</Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </OrgLayout>
  );
}

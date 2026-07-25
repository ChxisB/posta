import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { getEndpoints } from '@/lib/api';
export const dynamic = 'force-dynamic';

export default async function EndpointsPage({ params: p }: { params: Promise<{ permalink: string; serverId: string }> }) {
  const { permalink, serverId } = await p;
  let httpEndpoints: any[] = [], smtpEndpoints: any[] = [], addressEndpoints: any[] = [];
  try {
    const d = await getEndpoints(permalink, serverId);
    httpEndpoints = d.http_endpoints;
    smtpEndpoints = d.smtp_endpoints;
    addressEndpoints = d.address_endpoints;
  } catch {}

  return (
    <OrgLayout orgPermalink={permalink}>
      <div className="page-header">
        <h1 className="page-title">Endpoints</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/organizations/${permalink}/servers/${serverId}/endpoints/new?type=http`} className="btn btn-sm btn-primary">+ HTTP</Link>
          <Link href={`/organizations/${permalink}/servers/${serverId}/endpoints/new?type=smtp`} className="btn btn-sm btn-primary">+ SMTP</Link>
          <Link href={`/organizations/${permalink}/servers/${serverId}/endpoints/new?type=address`} className="btn btn-sm btn-primary">+ Address</Link>
        </div>
      </div>

      <div className="section-title">HTTP Endpoints</div>
      <div className="card" style={{ marginBottom: 24 }}>
        {httpEndpoints.length > 0 ? (
          <div className="table-container"><table className="table">
            <thead><tr><th>Name</th><th>URL</th><th>Format</th><th>Strip Replies</th></tr></thead>
            <tbody>{httpEndpoints.map((e: any) => (
              <tr key={e.id}>
                <td><Link href={`/organizations/${permalink}/servers/${serverId}/endpoints/${e.id}?type=http`} style={{ color: 'var(--color-accent)' }}>{e.name}</Link></td>
                <td style={{ color: 'var(--color-text-secondary)' }}>{e.url}</td>
                <td><span className="tag tag-blue">{e.format ?? 'JSON'}</span></td>
                <td>{e.strip_replies ? <span className="tag tag-green">Yes</span> : <span className="tag tag-gray">No</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 24 }}>No HTTP endpoints</p>}
      </div>

      <div className="section-title">SMTP Endpoints</div>
      <div className="card" style={{ marginBottom: 24 }}>
        {smtpEndpoints.length > 0 ? (
          <div className="table-container"><table className="table">
            <thead><tr><th>Name</th><th>Host</th><th>Port</th><th>SSL</th></tr></thead>
            <tbody>{smtpEndpoints.map((e: any) => (
              <tr key={e.id}>
                <td><Link href={`/organizations/${permalink}/servers/${serverId}/endpoints/${e.id}?type=smtp`} style={{ color: 'var(--color-accent)' }}>{e.name}</Link></td>
                <td style={{ color: 'var(--color-text-secondary)' }}>{e.hostname}</td>
                <td>{e.port ?? 25}</td>
                <td><span className="tag tag-blue">{e.ssl_mode ?? 'Auto'}</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 24 }}>No SMTP endpoints</p>}
      </div>

      <div className="section-title">Address Endpoints</div>
      <div className="card" style={{ marginBottom: 24 }}>
        {addressEndpoints.length > 0 ? (
          <div className="table-container"><table className="table">
            <thead><tr><th>Name</th><th>Email</th></tr></thead>
            <tbody>{addressEndpoints.map((e: any) => (
              <tr key={e.id}>
                <td><Link href={`/organizations/${permalink}/servers/${serverId}/endpoints/${e.id}?type=address`} style={{ color: 'var(--color-accent)' }}>{e.name}</Link></td>
                <td style={{ color: 'var(--color-text-secondary)' }}>{e.email}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 24 }}>No Address endpoints</p>}
      </div>
    </OrgLayout>
  );
}

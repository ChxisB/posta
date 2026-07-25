import OrgLayout from '@/components/org-layout';
import { getIpPools } from '@/lib/api';
import Link from 'next/link';
export const dynamic = 'force-dynamic';

export default async function IpPoolsPage() {
  let pools: any[] = [];
  try { const d = await getIpPools(); pools = d.ip_pools; } catch {}

  return (
    <OrgLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title gradient-text glow-text">IP Pools</h1>
            <div className="page-subtitle">Manage outbound IP pools</div>
          </div>
          <Link href="/admin/ip-pools/new" className="btn btn-primary">New Pool</Link>
        </div>
        <div className="card">
        <table className="table">
          <thead><tr><th>Name</th><th>Default</th><th>Addresses</th></tr></thead>
          <tbody>
            {pools.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 24 }}>No IP pools yet.</td></tr>
            ) : pools.map((p: any) => (
              <tr key={p.id}>
                <td><Link href={`/admin/ip-pools/${p.id}`} style={{ color: 'var(--color-accent)' }}>{p.name}</Link></td>
                <td>{p.default ? <span className="tag tag-green">Yes</span> : 'No'}</td>
                <td style={{ color: 'var(--color-text-muted)' }}>{p.ip_addresses?.length ?? 0} addresses</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </OrgLayout>
  );
}

import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { getDomain, getDomainSetup } from '@/lib/api';
export const dynamic = 'force-dynamic';

export default async function DomainSetupPage({
  params: p,
}: {
  params: Promise<{ permalink: string; serverId: string; domainId: string }>;
}) {
  const { permalink, serverId, domainId } = await p;

  let domain: any = {};
  let setup: any = {};
  try {
    const d = await getDomain(permalink, serverId, domainId);
    domain = d.domain ?? {};
  } catch {}
  try {
    const s = await getDomainSetup(permalink, serverId, domainId);
    setup = s;
  } catch {}

  return (
    <OrgLayout orgPermalink={permalink}>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/organizations/${permalink}/servers/${serverId}/domains`} style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
          &larr; Back to Domains
        </Link>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Domain Setup</h1>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 24 }}>
        {domain.name ?? setup.domain ?? 'Unknown domain'}
      </div>

      <div className="card" style={{ maxWidth: 700, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Verification Token</h3>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 14,
            padding: 12,
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            wordBreak: 'break-all',
          }}
        >
          {domain.verification_token ?? setup.verification_token ?? '-'}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 700 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>DNS Records</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ color: 'var(--color-text-muted)' }}>SPF</td>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{setup.spf ?? '-'}</td>
            </tr>
            <tr>
              <td style={{ color: 'var(--color-text-muted)' }}>DKIM</td>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{setup.dkim ?? '-'}</td>
            </tr>
            <tr>
              <td style={{ color: 'var(--color-text-muted)' }}>MX</td>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{setup.mx ?? '-'}</td>
            </tr>
            <tr>
              <td style={{ color: 'var(--color-text-muted)' }}>Return Path</td>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{setup.return_path ?? '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </OrgLayout>
  );
}

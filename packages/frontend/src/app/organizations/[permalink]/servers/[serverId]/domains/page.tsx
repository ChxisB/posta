'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { getDomains, createDomain, deleteDomain } from '@/lib/api';

export default function DomainsPage({
  params: paramsPromise,
}: {
  params: Promise<{ permalink: string; serverId: string }>;
}) {
  const { permalink, serverId } = use(paramsPromise);
  const [domains, setDomains] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ name: '' });

  async function load() {
    setLoading(true);
    try {
      const d = await getDomains(permalink, serverId);
      setDomains(d.domains ?? []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [permalink, serverId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createDomain(permalink, serverId, formData);
      setShowForm(false);
      setFormData({ name: '' });
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this domain?')) return;
    try {
      await deleteDomain(permalink, serverId, id);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <OrgLayout orgPermalink={permalink}>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title gradient-text glow-text">Domains</h1>
            <div className="page-subtitle text-gray-400">Configure and verify sender domains</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Add Domain'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="card animate-fade-in" style={{ marginBottom: 24, maxWidth: 400 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>New Domain</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                Name
              </label>
              <input
                className="input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="mail.example.com"
                required
                style={{ width: '100%' }}
              />
            </div>
            <button className="btn btn-primary" type="submit">Create Domain</button>
          </form>
        )}

        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Status</th>
                <th>SPF</th>
                <th>DKIM</th>
                <th>MX</th>
                <th>Verified</th>
                <th style={{ width: 80, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {domains.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 24 }}>
                    {loading ? 'Loading...' : 'No domains added yet.'}
                  </td>
                </tr>
              ) : (
                domains.map((d: any) => (
                  <tr key={d.id}>
                    <td>
                      <Link
                        href={`/organizations/${permalink}/servers/${serverId}/domains/${d.id}/setup`}
                        style={{ color: 'var(--color-accent)', fontWeight: 500 }}
                      >
                        {d.name}
                      </Link>
                    </td>
                    <td>
                      <span className={`tag ${d.verified_at ? 'tag-green' : 'tag-yellow'}`}>
                        {d.verified_at ? 'Verified' : 'Pending'}
                      </span>
                    </td>
                    <td>
                      <span className={`tag ${d.spf_status === 'OK' ? 'tag-green' : 'tag-red'}`}>
                        {d.spf_status ?? '-'}
                      </span>
                    </td>
                    <td>
                      <span className={`tag ${d.dkim_status === 'OK' ? 'tag-green' : 'tag-red'}`}>
                        {d.dkim_status ?? '-'}
                      </span>
                    </td>
                    <td>
                      <span className={`tag ${d.mx_status === 'OK' ? 'tag-green' : 'tag-red'}`}>
                        {d.mx_status ?? '-'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                      {d.verified_at ?? '-'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '2px 8px', fontSize: 12 }}
                        onClick={() => handleDelete(d.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </OrgLayout>
  );
}

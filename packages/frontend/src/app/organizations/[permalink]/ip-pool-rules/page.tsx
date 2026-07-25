'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import {
  getOrgIpPoolRules,
  createOrgIpPoolRule,
  deleteOrgIpPoolRule,
  getIpPools,
} from '@/lib/api';

export default function IpPoolRulesPage() {
  const { permalink } = useParams<{ permalink: string }>();
  const [rules, setRules] = useState<any[]>([]);
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ ip_pool_id: '', from_text: '', to_text: '' });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [rData, pData] = await Promise.all([getOrgIpPoolRules(permalink), getIpPools()]);
      setRules(rData.ip_pool_rules ?? []);
      setPools(pData.ip_pools ?? []);
    } catch (err: any) {
      setError(err.message || 'Failed to load IP pool rules');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [permalink]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createOrgIpPoolRule(permalink, {
        ip_pool_id: Number(formData.ip_pool_id),
        from_text: formData.from_text || undefined,
        to_text: formData.to_text || undefined,
      });
      setShowForm(false);
      setFormData({ ip_pool_id: '', from_text: '', to_text: '' });
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to create rule');
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Delete this IP pool rule?')) return;
    try {
      await deleteOrgIpPoolRule(permalink, ruleId);
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to delete rule');
    }
  };

  const poolName = (id: number) => pools.find((p) => p.id === id)?.name ?? `Pool ${id}`;

  return (
    <OrgLayout orgPermalink={permalink}>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/organizations/${permalink}`} style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
          &larr; Back to Organization
        </Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>IP Pool Rules</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'New Rule'}
        </button>
      </div>

      {error && (
        <div className="tag tag-red" style={{ marginBottom: 16 }}>{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: 24, maxWidth: 500 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>New IP Pool Rule</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>IP Pool</label>
            <select
              className="input"
              value={formData.ip_pool_id}
              onChange={(e) => setFormData({ ...formData, ip_pool_id: e.target.value })}
              required
            >
              <option value="">Select a pool</option>
              {pools.map((pool: any) => (
                <option key={pool.id} value={pool.id}>{pool.name}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>From Text</label>
            <input
              className="input"
              value={formData.from_text}
              onChange={(e) => setFormData({ ...formData, from_text: e.target.value })}
              placeholder="example.com"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>To Text</label>
            <input
              className="input"
              value={formData.to_text}
              onChange={(e) => setFormData({ ...formData, to_text: e.target.value })}
              placeholder="recipient@example.com"
            />
          </div>
          <button className="btn btn-primary" type="submit">Create Rule</button>
        </form>
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>IP Pool</th>
              <th>From</th>
              <th>To</th>
              <th style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 24 }}>
                  {loading ? 'Loading...' : 'No IP pool rules yet.'}
                </td>
              </tr>
            ) : (
              rules.map((rule: any) => (
                <tr key={rule.id}>
                  <td>{poolName(rule.ip_pool_id)}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{rule.from_text ?? '-'}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{rule.to_text ?? '-'}</td>
                  <td>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '2px 8px', fontSize: 12 }}
                      onClick={() => handleDelete(rule.uuid)}
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
    </OrgLayout>
  );
}

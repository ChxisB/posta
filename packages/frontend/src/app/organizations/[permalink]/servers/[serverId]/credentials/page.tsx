'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { getCredentials, createCredential, deleteCredential } from '@/lib/api';

export default function CredentialsPage({
  params: paramsPromise,
}: {
  params: Promise<{ permalink: string; serverId: string }>;
}) {
  const { permalink, serverId } = use(paramsPromise);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ type: 'SMTP', name: '', key: '' });

  async function load() {
    setLoading(true);
    try {
      const d = await getCredentials(permalink, serverId);
      setCredentials(d.credentials ?? []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [permalink, serverId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createCredential(permalink, serverId, formData);
      setShowForm(false);
      setFormData({ type: 'SMTP', name: '', key: '' });
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this credential?')) return;
    try {
      await deleteCredential(permalink, serverId, id);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <OrgLayout orgPermalink={permalink}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Credentials</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'New Credential'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: 24, maxWidth: 400 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>New Credential</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
              Type
            </label>
            <select
              className="input"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            >
              <option value="SMTP">SMTP</option>
              <option value="API">API</option>
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
              Name
            </label>
            <input
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="My credential"
              required
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
              Key
            </label>
            <input
              className="input"
              value={formData.key}
              onChange={(e) => setFormData({ ...formData, key: e.target.value })}
              placeholder="credential-key"
              required
            />
          </div>
          <button className="btn btn-primary" type="submit">Create Credential</button>
        </form>
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Key</th>
              <th>Hold</th>
              <th>Last Used</th>
              <th style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {credentials.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 24 }}>
                  {loading ? 'Loading...' : 'No credentials yet.'}
                </td>
              </tr>
            ) : (
              credentials.map((c: any) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td><span className="tag tag-gray">{c.type}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.key?.slice(0, 20)}...</td>
                  <td>{c.hold ? <span className="tag tag-yellow">Yes</span> : 'No'}</td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{c.last_used_at ?? 'Never'}</td>
                  <td>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '2px 8px', fontSize: 12 }}
                      onClick={() => handleDelete(c.id)}
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

'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { getRoutes, createRoute, deleteRoute } from '@/lib/api';

export default function RoutesPage({
  params: paramsPromise,
}: {
  params: Promise<{ permalink: string; serverId: string }>;
}) {
  const { permalink, serverId } = use(paramsPromise);
  const [routes, setRoutes] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ name: '', domain_id: '', endpoint_type: 'HTTPEndpoint', endpoint_host: '' });

  async function load() {
    setLoading(true);
    try {
      const d = await getRoutes(permalink, serverId);
      setRoutes(d.routes ?? []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [permalink, serverId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createRoute(permalink, serverId, formData);
      setShowForm(false);
      setFormData({ name: '', domain_id: '', endpoint_type: 'HTTP', endpoint_host: '' });
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this route?')) return;
    try {
      await deleteRoute(permalink, serverId, id);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <OrgLayout orgPermalink={permalink}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Routes</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'New Route'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: 24, maxWidth: 400 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>New Route</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
              Name
            </label>
            <input
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="My Route"
              required
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
              Domain ID
            </label>
            <input
              className="input"
              value={formData.domain_id}
              onChange={(e) => setFormData({ ...formData, domain_id: e.target.value })}
              placeholder="domain-id"
              required
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
              Endpoint Type
            </label>
            <select
              className="input"
              value={formData.endpoint_type}
              onChange={(e) => setFormData({ ...formData, endpoint_type: e.target.value })}
            >
              <option value="HTTPEndpoint">HTTP</option>
              <option value="SMTPEndpoint">SMTP</option>
              <option value="AddressEndpoint">Address</option>
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
              Endpoint Host
            </label>
            <input
              className="input"
              value={formData.endpoint_host}
              onChange={(e) => setFormData({ ...formData, endpoint_host: e.target.value })}
              placeholder="endpoint-host"
              required
            />
          </div>
          <button className="btn btn-primary" type="submit">Create Route</button>
        </form>
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Domain</th>
              <th>Mode</th>
              <th>Spam Mode</th>
              <th>Endpoint</th>
              <th style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {routes.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 24 }}>
                  {loading ? 'Loading...' : 'No routes yet.'}
                </td>
              </tr>
            ) : (
              routes.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{r.domain_id ?? '-'}</td>
                  <td><span className="tag tag-gray">{r.mode ?? 'Normal'}</span></td>
                  <td><span className="tag tag-gray">{r.spam_mode ?? 'None'}</span></td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{r.endpoint_type ?? '-'}</td>
                  <td>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '2px 8px', fontSize: 12 }}
                      onClick={() => handleDelete(r.id)}
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

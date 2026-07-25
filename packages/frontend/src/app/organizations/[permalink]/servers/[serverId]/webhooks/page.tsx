'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { getWebhooks, createWebhook, deleteWebhook } from '@/lib/api';

export default function WebhooksPage({
  params: paramsPromise,
}: {
  params: Promise<{ permalink: string; serverId: string }>;
}) {
  const { permalink, serverId } = use(paramsPromise);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ url: '', name: '', events: '' });

  async function load() {
    setLoading(true);
    try {
      const d = await getWebhooks(permalink, serverId);
      setWebhooks(d.webhooks ?? []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [permalink, serverId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload = {
        url: formData.url,
        name: formData.name,
        events: formData.events ? formData.events.split(',').map((s) => s.trim()).filter(Boolean) : [],
      };
      await createWebhook(permalink, serverId, payload);
      setShowForm(false);
      setFormData({ url: '', name: '', events: '' });
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this webhook?')) return;
    try {
      await deleteWebhook(permalink, serverId, id);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <OrgLayout orgPermalink={permalink}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Webhooks</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'New Webhook'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: 24, maxWidth: 400 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>New Webhook</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
              Name
            </label>
            <input
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="My Webhook"
              required
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
              URL
            </label>
            <input
              className="input"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://example.com/webhook"
              required
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
              Events (comma-separated)
            </label>
            <input
              className="input"
              value={formData.events}
              onChange={(e) => setFormData({ ...formData, events: e.target.value })}
              placeholder="MessageSent,MessageDelivered"
            />
          </div>
          <button className="btn btn-primary" type="submit">Create Webhook</button>
        </form>
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>URL</th>
              <th>Events</th>
              <th>Enabled</th>
              <th>Last Used</th>
              <th style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 24 }}>
                  {loading ? 'Loading...' : 'No webhooks yet.'}
                </td>
              </tr>
            ) : (
              webhooks.map((w: any) => (
                <tr key={w.id}>
                  <td>
                    <Link
                      href={`/organizations/${permalink}/servers/${serverId}/webhooks/${w.id}`}
                      style={{ color: 'var(--color-accent)' }}
                    >
                      {w.name}
                    </Link>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-muted)' }}>{w.url}</td>
                  <td><span className="tag tag-gray">{w.all_events ? 'All' : 'Selective'}</span></td>
                  <td>
                    {w.enabled ? (
                      <span className="tag tag-green">Enabled</span>
                    ) : (
                      <span className="tag tag-red">Disabled</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{w.last_used_at ?? 'Never'}</td>
                  <td>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '2px 8px', fontSize: 12 }}
                      onClick={() => handleDelete(w.id)}
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

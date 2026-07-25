'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { getWebhook, updateWebhook, getWebhookHistory, deleteWebhook } from '@/lib/api';

export default function EditWebhookPage() {
  const { permalink, serverId, webhookId } = useParams<{ permalink: string; serverId: string; webhookId: string }>();
  const router = useRouter();
  const [webhook, setWebhook] = useState<any>({});
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [sign, setSign] = useState(false);
  const [allEvents, setAllEvents] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [wData, hData] = await Promise.all([
        getWebhook(permalink, serverId, webhookId),
        getWebhookHistory(permalink, serverId, webhookId),
      ]);
      const w = wData.webhook ?? {};
      setWebhook(w);
      setName(w.name ?? '');
      setUrl(w.url ?? '');
      setEnabled(Boolean(w.enabled));
      setSign(Boolean(w.sign));
      setAllEvents(Boolean(w.all_events));
      setHistory(hData.requests ?? []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load webhook' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [permalink, serverId, webhookId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await updateWebhook(permalink, serverId, webhookId, {
        name,
        url,
        enabled,
        sign,
        all_events: allEvents,
      });
      setMessage({ type: 'success', text: 'Webhook updated.' });
      load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update webhook' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this webhook?')) return;
    try {
      await deleteWebhook(permalink, serverId, webhookId);
      router.push(`/organizations/${permalink}/servers/${serverId}/webhooks`);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete webhook' });
    }
  };

  return (
    <OrgLayout orgPermalink={permalink}>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/organizations/${permalink}/servers/${serverId}/webhooks`} style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
          &larr; Back to Webhooks
        </Link>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Edit Webhook</h1>
      <div className="card" style={{ maxWidth: 500, marginBottom: 24 }}>
        {loading ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {message && (
              <div className={`tag ${message.type === 'success' ? 'tag-green' : 'tag-red'}`}>{message.text}</div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>Name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Webhook"
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>URL</label>
              <input
                className="input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/webhook"
                required
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="enabled"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <label htmlFor="enabled" style={{ fontSize: 14, cursor: 'pointer' }}>Enabled</label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="sign"
                type="checkbox"
                checked={sign}
                onChange={(e) => setSign(e.target.checked)}
              />
              <label htmlFor="sign" style={{ fontSize: 14, cursor: 'pointer' }}>Sign Requests</label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="allEvents"
                type="checkbox"
                checked={allEvents}
                onChange={(e) => setAllEvents(e.target.checked)}
              />
              <label htmlFor="allEvents" style={{ fontSize: 14, cursor: 'pointer' }}>All Events</label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Webhook History</h3>
        {history.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No webhook requests yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>URL</th>
                <th>Attempts</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {history.map((req: any) => (
                <tr key={req.id}>
                  <td>{req.event ?? '-'}</td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{req.url ?? '-'}</td>
                  <td>{req.attempts ?? 0}</td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{req.created_at ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </OrgLayout>
  );
}

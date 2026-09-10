'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getRoute, updateRoute, deleteRoute } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export default function RouteEditPage() {
  const params = useParams<{ permalink: string; serverId: string; routeId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState('Accept');
  const [spamMode, setSpamMode] = useState('');
  const [endpointType, setEndpointType] = useState('');
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => {
    if (!params) return;
    (async () => {
      try {
        const data = await getRoute(params.permalink, params.serverId, params.routeId);
        const r = data.route ?? {};
        setName(r.name ?? '');
        setMode(r.mode ?? 'Accept');
        setSpamMode(r.spam_mode ?? '');
        setEndpointType(r.endpoint_type ?? '');
      } catch {}
      setLoading(false);
    })();
  }, [params]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, any> = {};
      if (name) payload.name = name;
      payload.mode = mode;
      payload.spam_mode = spamMode || null;
      payload.endpoint_type = endpointType || null;
      await updateRoute(params.permalink, params.serverId, params.routeId, payload);
      setMessage({ type: 'success', text: 'Route updated successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this route?')) return;
    try {
      await deleteRoute(params.permalink, params.serverId, params.routeId);
      router.push(`/organizations/${params.permalink}/servers/${params.serverId}/routes`);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  if (loading)
    return (
      <>
        <p>Loading...</p>
      </>
    );

  return (
    <>
      <Link
        href={`/organizations/${params.permalink}/servers/${params.serverId}/routes`}
        style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none' }}
      >
        &larr; Back to Routes
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '16px 0' }}>Edit Route</h1>
      {message && (
        <div className={`tag tag-${message.type === 'success' ? 'green' : 'red'}`}>
          {message.text}
        </div>
      )}
      <div
        className="rounded-2xl border border-line bg-panel p-6 shadow-elev-sm"
        style={{ maxWidth: 500 }}
      >
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>Mode</label>
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="Accept">Accept</option>
              <option value="Hold">Hold</option>
              <option value="Bounce">Bounce</option>
              <option value="Reject">Reject</option>
            </Select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>Spam Mode</label>
            <Select value={spamMode} onChange={(e) => setSpamMode(e.target.value)}>
              <option value="">Default</option>
              <option value="Mark">Mark</option>
              <option value="Quarantine">Quarantine</option>
              <option value="Fail">Fail</option>
            </Select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>Endpoint Type</label>
            <Select value={endpointType} onChange={(e) => setEndpointType(e.target.value)}>
              <option value="">None</option>
              <option value="HTTPEndpoint">HTTP</option>
              <option value="SMTPEndpoint">SMTP</option>
              <option value="AddressEndpoint">Address</option>
            </Select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="danger" type="button" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

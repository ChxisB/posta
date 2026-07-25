'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import OrgLayout from '@/components/org-layout';
import { getEndpoint, updateEndpoint, deleteEndpoint } from '@/lib/api';

export default function EndpointEditPage() {
  const params = useParams<{ permalink: string; serverId: string; endpointId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const type = searchParams.get('type') ?? 'http';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [hostname, setHostname] = useState('');
  const [port, setPort] = useState('25');
  const [sslMode, setSslMode] = useState('Auto');
  const [email, setEmail] = useState('');
  const [format, setFormat] = useState('RawMessage');
  const [encoding, setEncoding] = useState('Base64');
  const [stripReplies, setStripReplies] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => {
    if (!params) return;
    (async () => {
      try {
        const data = await getEndpoint(params.permalink, params.serverId, type, params.endpointId);
        const e = data.endpoint ?? {};
        setName(e.name ?? '');
        setUrl(e.url ?? '');
        setHostname(e.hostname ?? '');
        setPort(String(e.port ?? 25));
        setSslMode(e.ssl_mode ?? 'Auto');
        setEmail(e.email ?? '');
        setFormat(e.format ?? 'RawMessage');
        setEncoding(e.encoding ?? 'Base64');
        setStripReplies(!!e.strip_replies);
      } catch {}
      setLoading(false);
    })();
  }, [params, type]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, any> = { name };
      if (type === 'http') { payload.url = url; payload.format = format; payload.encoding = encoding; payload.strip_replies = stripReplies; }
      if (type === 'smtp') { payload.hostname = hostname; payload.port = parseInt(port); payload.ssl_mode = sslMode; }
      if (type === 'address') { payload.email = email; }
      await updateEndpoint(params.permalink, params.serverId, type, params.endpointId, payload);
      setMessage({ type: 'success', text: 'Endpoint updated successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this endpoint?')) return;
    try {
      await deleteEndpoint(params.permalink, params.serverId, type, params.endpointId);
      router.push(`/organizations/${params.permalink}/servers/${params.serverId}/endpoints`);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  if (loading) return <OrgLayout orgPermalink={params?.permalink ?? ''}><p>Loading...</p></OrgLayout>;

  return (
    <OrgLayout orgPermalink={params.permalink}>
      <Link href={`/organizations/${params.permalink}/servers/${params.serverId}/endpoints`}
        style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none' }}>&larr; Back to Endpoints</Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '16px 0' }}>Edit {type.toUpperCase()} Endpoint</h1>
      {message && <div className={`tag tag-${message.type === 'success' ? 'green' : 'red'}`}>{message.text}</div>}
      <div className="card" style={{ maxWidth: 500 }}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={{ display: 'block', marginBottom: 4 }}>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          {type === 'http' && <>
            <div><label style={{ display: 'block', marginBottom: 4 }}>URL</label><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
            <div><label style={{ display: 'block', marginBottom: 4 }}>Format</label><select className="input" value={format} onChange={(e) => setFormat(e.target.value)}><option>RawMessage</option><option>JSON</option></select></div>
            <div><label style={{ display: 'block', marginBottom: 4 }}>Encoding</label><select className="input" value={encoding} onChange={(e) => setEncoding(e.target.value)}><option>Base64</option><option>Quoted-Printable</option></select></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={stripReplies} onChange={(e) => setStripReplies(e.target.checked)} /><label>Strip replies</label></div>
          </>}
          {type === 'smtp' && <>
            <div><label style={{ display: 'block', marginBottom: 4 }}>Hostname</label><input className="input" value={hostname} onChange={(e) => setHostname(e.target.value)} /></div>
            <div><label style={{ display: 'block', marginBottom: 4 }}>Port</label><input className="input" type="number" value={port} onChange={(e) => setPort(e.target.value)} /></div>
            <div><label style={{ display: 'block', marginBottom: 4 }}>SSL Mode</label><select className="input" value={sslMode} onChange={(e) => setSslMode(e.target.value)}><option>Auto</option><option>STARTTLS</option><option>TLS</option><option>None</option></select></div>
          </>}
          {type === 'address' && <>
            <div><label style={{ display: 'block', marginBottom: 4 }}>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" className="btn btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </form>
      </div>
    </OrgLayout>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import OrgLayout from '@/components/org-layout';
import { getCredential, updateCredential, deleteCredential } from '@/lib/api';

export default function CredentialEditPage() {
  const params = useParams<{ permalink: string; serverId: string; credId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [hold, setHold] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => {
    if (!params) return;
    (async () => {
      try {
        const data = await getCredential(params.permalink, params.serverId, params.credId);
        const c = data.credential ?? {};
        setName(c.name ?? '');
        setHold(c.hold ? true : false);
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
      payload.hold = hold;
      await updateCredential(params.permalink, params.serverId, params.credId, payload);
      setMessage({ type: 'success', text: 'Credential updated successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this credential?')) return;
    try {
      await deleteCredential(params.permalink, params.serverId, params.credId);
      router.push(`/organizations/${params.permalink}/servers/${params.serverId}/credentials`);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  if (loading) return <OrgLayout orgPermalink={params?.permalink ?? ''}><p>Loading...</p></OrgLayout>;

  return (
    <OrgLayout orgPermalink={params.permalink}>
      <Link href={`/organizations/${params.permalink}/servers/${params.serverId}/credentials`}
        style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none' }}>
        &larr; Back to Credentials
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '16px 0' }}>Edit Credential</h1>
      {message && <div className={`tag tag-${message.type === 'success' ? 'green' : 'red'}`}>{message.text}</div>}
      <div className="card" style={{ maxWidth: 500 }}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} />
            <label>Hold messages from this credential</label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" className="btn btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </form>
      </div>
    </OrgLayout>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getCredential, updateCredential, deleteCredential } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
    } finally {
      setSaving(false);
    }
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

  if (loading)
    return (
      <>
        <p>Loading...</p>
      </>
    );

  return (
    <>
      <Link
        href={`/organizations/${params.permalink}/servers/${params.serverId}/credentials`}
        style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none' }}
      >
        &larr; Back to Credentials
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '16px 0' }}>Edit Credential</h1>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} />
            <label>Hold messages from this credential</label>
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

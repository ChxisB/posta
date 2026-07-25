'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import OrgLayout from '@/components/org-layout';
import { getUser, updateUser, deleteUser } from '@/lib/api';

export default function UserEditPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [admin, setAdmin] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => {
    if (!params) return;
    (async () => {
      try {
        const data = await getUser(params.userId);
        const u = data.user ?? {};
        setFirstName(u.first_name ?? '');
        setLastName(u.last_name ?? '');
        setEmail(u.email_address ?? '');
        setAdmin(!!u.admin);
      } catch {}
      setLoading(false);
    })();
  }, [params]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await updateUser(params.userId, { first_name: firstName, last_name: lastName, email_address: email, admin });
      setMessage({ type: 'success', text: 'User updated successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this user?')) return;
    try {
      await deleteUser(params.userId);
      router.push('/admin/users');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  if (loading) return <OrgLayout><p>Loading...</p></OrgLayout>;

  return (
    <OrgLayout>
      <div className="back-link"><Link href="/admin/users" style={{ color: 'inherit', textDecoration: 'none' }}>&larr; Back to Users</Link></div>
      <h1 className="page-title" style={{ marginBottom: 24 }}>Edit User</h1>
      {message && <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`}>{message.text}</div>}
      <div className="card" style={{ maxWidth: 500 }}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group"><label className="form-label">First Name</label><input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Last Name</label><input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /><label>Admin</label></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" className="btn btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </form>
      </div>
    </OrgLayout>
  );
}

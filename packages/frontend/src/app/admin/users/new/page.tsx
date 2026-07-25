'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { createUser } from '@/lib/api';

export default function NewUserPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [admin, setAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createUser({
        first_name: firstName,
        last_name: lastName,
        email_address: email,
        admin,
      });
      router.push('/admin/users');
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OrgLayout>
      <div style={{ marginBottom: 24 }}>
        <Link href="/admin/users" style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
          &larr; Back to Users
        </Link>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>New User</h1>
      <div className="card" style={{ maxWidth: 500 }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div className="tag tag-red">{error}</div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>First Name</label>
            <input
              className="input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>Last Name</label>
            <input
              className="input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>Email Address</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              required
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="admin"
              type="checkbox"
              checked={admin}
              onChange={(e) => setAdmin(e.target.checked)}
            />
            <label htmlFor="admin" style={{ fontSize: 14, cursor: 'pointer' }}>Admin</label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create User'}
            </button>
            <button type="button" className="btn" onClick={() => router.back()}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </OrgLayout>
  );
}

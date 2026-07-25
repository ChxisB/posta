'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { createIpPool } from '@/lib/api';

export default function NewIpPoolPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [defaultPool, setDefaultPool] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createIpPool({ name, default_pool: defaultPool });
      router.push('/admin/ip-pools');
    } catch (err: any) {
      setError(err.message || 'Failed to create IP pool');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OrgLayout>
      <div style={{ marginBottom: 24 }}>
        <Link href="/admin/ip-pools" style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
          &larr; Back to IP Pools
        </Link>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>New IP Pool</h1>
      <div className="card" style={{ maxWidth: 500 }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div className="tag tag-red">{error}</div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Pool"
              required
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="defaultPool"
              type="checkbox"
              checked={defaultPool}
              onChange={(e) => setDefaultPool(e.target.checked)}
            />
            <label htmlFor="defaultPool" style={{ fontSize: 14, cursor: 'pointer' }}>Default Pool</label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Pool'}
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

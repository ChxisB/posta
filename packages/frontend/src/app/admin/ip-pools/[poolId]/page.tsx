'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { getIpPool, getIpAddresses, createIpAddress, deleteIpAddress } from '@/lib/api';

export default function IpPoolDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = use(paramsPromise);
  const [pool, setPool] = useState<any>({});
  const [addresses, setAddresses] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ ip: '', hostname: '' });

  async function load() {
    setLoading(true);
    try {
      const poolData = await getIpPool(poolId);
      setPool(poolData.ip_pool ?? {});
    } catch {}
    try {
      const addrData = await getIpAddresses(poolId);
      setAddresses(addrData.ip_addresses ?? []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [poolId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createIpAddress(poolId, formData);
      setShowForm(false);
      setFormData({ ip: '', hostname: '' });
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDelete(addressId: string) {
    if (!confirm('Remove this IP address?')) return;
    try {
      await deleteIpAddress(poolId, addressId);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <OrgLayout>
      <div style={{ marginBottom: 24 }}>
        <Link href="/admin/ip-pools" style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
          &larr; Back to IP Pools
        </Link>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{pool.name ?? 'IP Pool'}</h1>
        <div style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
          ID: {pool.id} &middot; Default: {pool.default ? 'Yes' : 'No'}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>IP Addresses</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add IP Address'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: 24, maxWidth: 400 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Add IP Address</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
              IP Address
            </label>
            <input
              className="input"
              value={formData.ip}
              onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
              placeholder="192.168.1.1"
              required
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
              Hostname (optional)
            </label>
            <input
              className="input"
              value={formData.hostname}
              onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
              placeholder="mail.example.com"
            />
          </div>
          <button className="btn btn-primary" type="submit">Add IP Address</button>
        </form>
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>IP Address</th>
              <th>Hostname</th>
              <th style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {addresses.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 24 }}>
                  {loading ? 'Loading...' : 'No IP addresses yet.'}
                </td>
              </tr>
            ) : (
              addresses.map((addr: any) => (
                <tr key={addr.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{addr.ip}</td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{addr.hostname ?? '-'}</td>
                  <td>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '2px 8px', fontSize: 12 }}
                      onClick={() => handleDelete(addr.id)}
                    >
                      Remove
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

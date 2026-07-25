'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { getTrackDomains, createTrackDomain, deleteTrackDomain } from '@/lib/api';

export default function TrackDomainsPage({
  params: paramsPromise,
}: {
  params: Promise<{ permalink: string; serverId: string }>;
}) {
  const { permalink, serverId } = use(paramsPromise);
  const [trackDomains, setTrackDomains] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ name: '' });

  async function load() {
    setLoading(true);
    try {
      const d = await getTrackDomains(permalink, serverId);
      setTrackDomains(d.track_domains ?? []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [permalink, serverId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createTrackDomain(permalink, serverId, formData);
      setShowForm(false);
      setFormData({ name: '' });
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this track domain?')) return;
    try {
      await deleteTrackDomain(permalink, serverId, id);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <OrgLayout orgPermalink={permalink}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Track Domains</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'New Track Domain'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: 24, maxWidth: 400 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>New Track Domain</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
              Name
            </label>
            <input
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="track.example.com"
              required
            />
          </div>
          <button className="btn btn-primary" type="submit">Create Track Domain</button>
        </form>
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>SSL</th>
              <th>Click Tracking</th>
              <th>Load Tracking</th>
              <th style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {trackDomains.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 24 }}>
                  {loading ? 'Loading...' : 'No track domains yet.'}
                </td>
              </tr>
            ) : (
              trackDomains.map((td: any) => (
                <tr key={td.id}>
                  <td>
                    <Link
                      href={`/organizations/${permalink}/servers/${serverId}/track-domains/${td.id}`}
                      style={{ color: 'var(--color-accent)' }}
                    >
                      {td.name}
                    </Link>
                  </td>
                  <td>
                    <span className={`tag ${td.ssl_enabled ? 'tag-green' : 'tag-gray'}`}>
                      {td.ssl_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <span className={`tag ${td.track_clicks ? 'tag-green' : 'tag-gray'}`}>
                      {td.track_clicks ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <span className={`tag ${td.track_loads ? 'tag-green' : 'tag-gray'}`}>
                      {td.track_loads ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '2px 8px', fontSize: 12 }}
                      onClick={() => handleDelete(td.id)}
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

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import {
  getTrackDomain,
  updateTrackDomain,
  toggleTrackDomainSsl,
  checkTrackDomainDns,
  deleteTrackDomain,
} from '@/lib/api';

export default function EditTrackDomainPage() {
  const { permalink, serverId, domainId } = useParams<{ permalink: string; serverId: string; domainId: string }>();
  const router = useRouter();
  const [domain, setDomain] = useState<any>({});
  const [name, setName] = useState('');
  const [sslEnabled, setSslEnabled] = useState(false);
  const [trackClicks, setTrackClicks] = useState(false);
  const [trackLoads, setTrackLoads] = useState(false);
  const [excludedClickDomains, setExcludedClickDomains] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await getTrackDomain(permalink, serverId, domainId);
      const d = data.track_domain ?? {};
      setDomain(d);
      setName(d.name ?? '');
      setSslEnabled(Boolean(d.ssl_enabled));
      setTrackClicks(Boolean(d.track_clicks));
      setTrackLoads(Boolean(d.track_loads));
      setExcludedClickDomains(d.excluded_click_domains ?? '');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load track domain' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [permalink, serverId, domainId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload: any = {
        ssl_enabled: sslEnabled,
        track_clicks: trackClicks,
        track_loads: trackLoads,
        excluded_click_domains: excludedClickDomains || undefined,
      };
      if (name !== domain.name) {
        payload.name = name;
      }
      await updateTrackDomain(permalink, serverId, domainId, payload);
      setMessage({ type: 'success', text: 'Track domain updated.' });
      load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update track domain' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSsl = async () => {
    setMessage(null);
    try {
      const data = await toggleTrackDomainSsl(permalink, serverId, domainId);
      setSslEnabled(data.ssl_enabled);
      setMessage({ type: 'success', text: `SSL ${data.ssl_enabled ? 'enabled' : 'disabled'}.` });
      load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to toggle SSL' });
    }
  };

  const handleCheckDns = async () => {
    setMessage(null);
    try {
      const data = await checkTrackDomainDns(permalink, serverId, domainId);
      setMessage({ type: 'success', text: `DNS check: ${data.status}.` });
      load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to check DNS' });
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this track domain?')) return;
    try {
      await deleteTrackDomain(permalink, serverId, domainId);
      router.push(`/organizations/${permalink}/servers/${serverId}/track-domains`);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete track domain' });
    }
  };

  return (
    <OrgLayout orgPermalink={permalink}>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/organizations/${permalink}/servers/${serverId}/track-domains`} style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
          &larr; Back to Track Domains
        </Link>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Edit Track Domain</h1>
      <div className="card" style={{ maxWidth: 500 }}>
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
                placeholder="track.example.com"
                required
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="sslEnabled"
                type="checkbox"
                checked={sslEnabled}
                onChange={(e) => setSslEnabled(e.target.checked)}
              />
              <label htmlFor="sslEnabled" style={{ fontSize: 14, cursor: 'pointer' }}>SSL Enabled</label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="trackClicks"
                type="checkbox"
                checked={trackClicks}
                onChange={(e) => setTrackClicks(e.target.checked)}
              />
              <label htmlFor="trackClicks" style={{ fontSize: 14, cursor: 'pointer' }}>Track Clicks</label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="trackLoads"
                type="checkbox"
                checked={trackLoads}
                onChange={(e) => setTrackLoads(e.target.checked)}
              />
              <label htmlFor="trackLoads" style={{ fontSize: 14, cursor: 'pointer' }}>Track Loads</label>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>Excluded Click Domains</label>
              <input
                className="input"
                value={excludedClickDomains}
                onChange={(e) => setExcludedClickDomains(e.target.value)}
                placeholder="example.com, another.com"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" className="btn" onClick={handleToggleSsl}>
                Toggle SSL
              </button>
              <button type="button" className="btn" onClick={handleCheckDns}>
                Check DNS
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </form>
        )}
      </div>
    </OrgLayout>
  );
}

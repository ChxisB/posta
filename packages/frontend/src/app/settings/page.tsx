'use client';

import { useEffect, useState } from 'react';
import OrgLayout from '@/components/org-layout';
import { getSettings, updateSettings } from '@/lib/api';

export default function SettingsPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [timeZone, setTimeZone] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getSettings();
        if (cancelled) return;
        const user = data.user ?? {};
        setFirstName(user.first_name ?? '');
        setLastName(user.last_name ?? '');
        setTimeZone(user.time_zone ?? '');
      } catch (err: any) {
        if (!cancelled) {
          setMessage({ type: 'error', text: err.message || 'Failed to load settings' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updateSettings({
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        time_zone: timeZone || undefined,
      });
      setMessage({ type: 'success', text: 'Settings saved successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <OrgLayout>
      <div className="animate-fade-in">
        <h1 className="page-title gradient-text glow-text" style={{ marginBottom: 24 }}>Settings</h1>

        <div className="card" style={{ maxWidth: 500, marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">Profile</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {message && (
              <div className={`tag ${message.type === 'success' ? 'tag-green' : 'tag-red'}`}>
                {message.text}
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>First Name</label>
              <input
                className="input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                disabled={loading}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>Last Name</label>
              <input
                className="input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                disabled={loading}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>Time Zone</label>
              <input
                className="input"
                value={timeZone}
                onChange={(e) => setTimeZone(e.target.value)}
                placeholder="UTC"
                disabled={loading}
              />
            </div>
            <div>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </OrgLayout>
  );
}

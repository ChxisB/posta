'use client';
import { useState } from 'react';
import { updateServer } from '@/lib/api';

interface ServerSettingsFormProps {
  orgPermalink: string;
  serverId: string;
  server: any;
}

export default function ServerSettingsForm({ orgPermalink, serverId, server }: ServerSettingsFormProps) {
  const [sendLimit, setSendLimit] = useState<number>(server.send_limit ?? 0);
  const [spamThreshold, setSpamThreshold] = useState<string>(
    server.spam_threshold != null ? String(server.spam_threshold) : '',
  );
  const [spamFailureThreshold, setSpamFailureThreshold] = useState<string>(
    server.spam_failure_threshold != null ? String(server.spam_failure_threshold) : '',
  );
  const [postmasterAddress, setPostmasterAddress] = useState<string>(server.postmaster_address ?? '');
  const [privacyMode, setPrivacyMode] = useState<boolean>(server.privacy_mode ?? false);
  const [messageRetentionDays, setMessageRetentionDays] = useState<number>(
    server.message_retention_days ?? 60,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await updateServer(orgPermalink, serverId, {
        send_limit: sendLimit,
        spam_threshold: spamThreshold !== '' ? Number(spamThreshold) : null,
        spam_failure_threshold: spamFailureThreshold !== '' ? Number(spamFailureThreshold) : null,
        postmaster_address: postmasterAddress || null,
        privacy_mode: privacyMode,
        message_retention_days: messageRetentionDays,
      });
      setMessage({ type: 'success', text: 'Settings saved successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`}>
          {message.type === 'success' ? '✓ ' : '✗ '}{message.text}
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Send Limit</label>
        <input type="number" className="input" value={sendLimit}
          onChange={(e) => setSendLimit(Number(e.target.value) || 0)} min={0} />
      </div>

      <div className="form-group">
        <label className="form-label">Spam Threshold</label>
        <input type="number" className="input" value={spamThreshold}
          onChange={(e) => setSpamThreshold(e.target.value)} placeholder="e.g. 5" step="0.1" />
        <div className="form-hint">Messages scoring above this will be flagged as spam. Leave empty to disable.</div>
      </div>

      <div className="form-group">
        <label className="form-label">Spam Failure Threshold</label>
        <input type="number" className="input" value={spamFailureThreshold}
          onChange={(e) => setSpamFailureThreshold(e.target.value)} placeholder="e.g. 10" step="0.1" />
        <div className="form-hint">Messages scoring above this will be rejected. Leave empty to disable.</div>
      </div>

      <div className="form-group">
        <label className="form-label">Postmaster Address</label>
        <input type="text" className="input" value={postmasterAddress}
          onChange={(e) => setPostmasterAddress(e.target.value)} placeholder="postmaster@example.com" />
      </div>

      <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" id="privacyMode" checked={privacyMode}
          onChange={(e) => setPrivacyMode(e.target.checked)} />
        <label htmlFor="privacyMode" style={{ fontSize: 14, cursor: 'pointer' }}>Privacy Mode</label>
      </div>

      <div className="form-group">
        <label className="form-label">Message Retention (days)</label>
        <input type="number" className="input" value={messageRetentionDays}
          onChange={(e) => setMessageRetentionDays(Number(e.target.value) || 0)} min={1} />
      </div>

      <div style={{ paddingTop: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </form>
  );
}

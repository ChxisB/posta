'use client';
import { useState } from 'react';
import { updateServer } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ServerSettingsFormProps {
  orgPermalink: string;
  serverId: string;
  server: any;
}

export default function ServerSettingsForm({
  orgPermalink,
  serverId,
  server,
}: ServerSettingsFormProps) {
  const [sendLimit, setSendLimit] = useState<number>(server.send_limit ?? 0);
  const [spamThreshold, setSpamThreshold] = useState<string>(
    server.spam_threshold != null ? String(server.spam_threshold) : '',
  );
  const [spamFailureThreshold, setSpamFailureThreshold] = useState<string>(
    server.spam_failure_threshold != null ? String(server.spam_failure_threshold) : '',
  );
  const [postmasterAddress, setPostmasterAddress] = useState<string>(
    server.postmaster_address ?? '',
  );
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
          {message.type === 'success' ? '✓ ' : '✗ '}
          {message.text}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-1.5">
        <label className="text-xs font-medium text-foreground">Send Limit</label>
        <Input
          type="number"
          value={sendLimit}
          onChange={(e) => setSendLimit(Number(e.target.value) || 0)}
          min={0}
        />
      </div>

      <div className="mb-4 flex flex-col gap-1.5">
        <label className="text-xs font-medium text-foreground">Spam Threshold</label>
        <Input
          type="number"
          value={spamThreshold}
          onChange={(e) => setSpamThreshold(e.target.value)}
          placeholder="e.g. 5"
          step="0.1"
        />
        <div className="text-2xs leading-relaxed text-faint">
          Messages scoring above this will be flagged as spam. Leave empty to disable.
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-1.5">
        <label className="text-xs font-medium text-foreground">Spam Failure Threshold</label>
        <Input
          type="number"
          value={spamFailureThreshold}
          onChange={(e) => setSpamFailureThreshold(e.target.value)}
          placeholder="e.g. 10"
          step="0.1"
        />
        <div className="text-2xs leading-relaxed text-faint">
          Messages scoring above this will be rejected. Leave empty to disable.
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-1.5">
        <label className="text-xs font-medium text-foreground">Postmaster Address</label>
        <Input
          type="text"
          value={postmasterAddress}
          onChange={(e) => setPostmasterAddress(e.target.value)}
          placeholder="postmaster@example.com"
        />
      </div>

      <div
        className="mb-4 flex flex-col gap-1.5"
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <input
          type="checkbox"
          id="privacyMode"
          checked={privacyMode}
          onChange={(e) => setPrivacyMode(e.target.checked)}
        />
        <label htmlFor="privacyMode" style={{ fontSize: 14, cursor: 'pointer' }}>
          Privacy Mode
        </label>
      </div>

      <div className="mb-4 flex flex-col gap-1.5">
        <label className="text-xs font-medium text-foreground">Message Retention (days)</label>
        <Input
          type="number"
          value={messageRetentionDays}
          onChange={(e) => setMessageRetentionDays(Number(e.target.value) || 0)}
          min={1}
        />
      </div>

      <div style={{ paddingTop: 8 }}>
        <Button variant="primary" type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </form>
  );
}

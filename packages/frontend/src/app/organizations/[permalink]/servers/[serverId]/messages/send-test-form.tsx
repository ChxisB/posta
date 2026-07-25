'use client';

import { useState, useEffect } from 'react';
import { sendTestMessage } from '@/lib/api';

export default function SendTestForm({
  permalink, serverId,
}: { permalink: string; serverId: string }) {
  const [mounted, setMounted] = useState(false);
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const handleSend = async () => {
    if (!to) return;
    setSending(true);
    setResult(null);
    try {
      const res = await sendTestMessage(permalink, parseInt(serverId), to);
      setResult(`Test message queued (ID: ${res.message_id})`);
      setTo('');
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  if (!mounted) return null;

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
      <input
        type="email" placeholder="Recipient email"
        value={to} onChange={(e) => setTo(e.target.value)}
        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc' }}
      />
      <button className="btn btn-primary" onClick={handleSend} disabled={sending || !to}>
        {sending ? 'Sending...' : 'Send Test'}
      </button>
      {result && <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{result}</span>}
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { WizardState } from '../wizard-client';
import { sendTestMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { StepIntro } from './step-intro';

interface Props {
  state: WizardState;
  updateState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StepTestSend({ state, updateState, onNext, onBack }: Props) {
  const [to, setTo] = useState('');
  const [from, setFrom] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.orgPermalink || !state.serverId) return;
    if (!to.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await sendTestMessage(
        state.orgPermalink,
        state.serverId,
        to.trim(),
        from.trim() || undefined,
      );
      setResult({ success: true, message: `Message sent! ID: ${data.message_id}` });
      updateState({ testSent: true });
    } catch (err: any) {
      setError(err.message || 'Failed to send test message');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 max-w-lg">
      <StepIntro
        title="Send a test message"
        optional
        needs="a mailbox you can check — use your own address."
        next="The message appears under Messages with its full delivery history."
      >
        The only way to know the whole chain works. If DNS has not propagated yet this may fail or
        land in spam, which is expected — you can skip it and come back once the previous step is
        green.
      </StepIntro>
      {!result ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Send Test To</label>
            <Input
              className="w-full"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <p className="text-xs text-muted mt-1">
              Enter an email address to receive the test message.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">From (optional)</label>
            <Input
              className="w-full"
              type="email"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder={state.domainName ? `test@${state.domainName}` : 'test@yourdomain.com'}
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red bg-red/10 rounded-lg px-3 py-2">
              <XCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading || !to.trim()}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {loading ? 'Sending...' : 'Send Test Email'}
            </Button>
            <Button type="button" variant="secondary" onClick={onBack}>
              Back
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-lg border border-green/30 bg-green/5 p-4">
            <CheckCircle2 className="h-5 w-5 text-green shrink-0" />
            <div>
              <p className="text-sm font-medium">Test message sent</p>
              <p className="text-sm text-muted">{result.message}</p>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={onBack}>
              Back
            </Button>
            <Button onClick={onNext}>View Summary</Button>
          </div>
        </div>
      )}

      <div className="border-t pt-4">
        <Button variant="ghost" onClick={onNext}>
          Skip test & continue to summary
        </Button>
      </div>
    </div>
  );
}

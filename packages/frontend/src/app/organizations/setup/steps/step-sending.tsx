'use client';

import { useState } from 'react';
import type { WizardState } from '../wizard-client';
import { createEndpoint, createRoute } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, ArrowRight, Mail, Inbox } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { StepIntro } from './step-intro';

interface Props {
  state: WizardState;
  updateState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StepSending({ state, updateState, onNext, onBack }: Props) {
  const [direction, setDirection] = useState<'outgoing' | 'incoming' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incomingDone, setIncomingDone] = useState(false);

  // Incoming mail inline form fields
  const [endpointName, setEndpointName] = useState('Incoming Webhook');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [routeName, setRouteName] = useState('Catch All');

  const handleDirectionSelect = (dir: 'outgoing' | 'incoming') => {
    setDirection(dir);
    if (dir === 'outgoing') {
      // No additional setup needed for outgoing
      onNext();
    }
  };

  const handleSetupIncoming = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.orgPermalink || !state.serverId || !state.domainId) return;
    setLoading(true);
    setError(null);
    try {
      const permalink = state.orgPermalink;
      const serverId = String(state.serverId);
      // Create HTTP endpoint
      const epData = await createEndpoint(permalink, serverId, 'http', {
        name: endpointName.trim() || 'Incoming Webhook',
        url: endpointUrl.trim(),
        format: 'JSON',
        encoding: 'Base64',
        strip_replies: false,
      });
      const endpoint = epData.endpoint;
      // Create route pointing to endpoint
      await createRoute(permalink, serverId, {
        name: routeName.trim() || 'Catch All',
        domain_id: state.domainId,
        endpoint_type: 'HTTPEndpoint',
        endpoint_host: String(endpoint.id),
      });
      setIncomingDone(true);
    } catch (err: any) {
      setError(err.message || 'Failed to set up incoming mail');
    } finally {
      setLoading(false);
    }
  };

  if (direction === 'outgoing') {
    return (
      <div className="space-y-5 max-w-lg">
        <div className="flex items-center gap-3 rounded-lg border border-green/30 bg-green/5 p-4">
          <CheckCircle2 className="h-5 w-5 text-green shrink-0" />
          <div>
            <p className="text-sm font-medium">Outgoing email selected</p>
            <p className="text-sm text-muted">
              Your server is configured to send email. Add incoming routes later if needed.
            </p>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onNext}>Continue to Test Send</Button>
        </div>
      </div>
    );
  }

  if (incomingDone) {
    return (
      <div className="space-y-5 max-w-lg">
        <div className="flex items-center gap-3 rounded-lg border border-green/30 bg-green/5 p-4">
          <CheckCircle2 className="h-5 w-5 text-green shrink-0" />
          <div>
            <p className="text-sm font-medium">Incoming mail configured</p>
            <p className="text-sm text-muted">
              Endpoint and route created. Mail sent to your domain will be forwarded to the webhook
              URL.
            </p>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onNext}>Continue to Test Send</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg">
      <StepIntro
        title="Choose what this server does"
        optional
        next="If you pick incoming, Posta sets up a route and endpoint for you."
      >
        Sending only is the common case, and it is already configured — you can skip this. Choose
        incoming as well if you also want this server to receive mail and forward it somewhere, such
        as an HTTP endpoint in your application.
      </StepIntro>
      {/* Outgoing */}
      <button
        onClick={() => handleDirectionSelect('outgoing')}
        className="w-full text-left rounded-lg border border-line p-4 hover:border-accent/30 hover:bg-accent/5 transition-all group"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/15 to-blue-500/5 text-sky ring-1 ring-accent/20">
            <Mail className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm flex items-center gap-1">
              Outgoing Email
              <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
            </h3>
            <p className="text-sm text-muted mt-1">
              Send transactional and marketing emails through SMTP or API.
            </p>
          </div>
        </div>
      </button>

      {/* Incoming */}
      <button
        onClick={() => setDirection('incoming')}
        className="w-full text-left rounded-lg border border-line p-4 hover:border-accent/30 hover:bg-accent/5 transition-all group"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-green ring-1 ring-green/20">
            <Inbox className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm flex items-center gap-1">
              Incoming Email
              <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
            </h3>
            <p className="text-sm text-muted mt-1">
              Receive email and forward it to an HTTP endpoint or SMTP server.
            </p>
          </div>
        </div>
      </button>

      {/* Incoming setup form */}
      {direction === 'incoming' && (
        <form
          onSubmit={handleSetupIncoming}
          className="space-y-4 border border-line rounded-lg p-4 mt-2"
        >
          <h4 className="text-sm font-medium">Configure Incoming Route</h4>
          <div>
            <label className="block text-sm font-medium mb-1.5">Endpoint Name</label>
            <Input
              className="w-full"
              value={endpointName}
              onChange={(e) => setEndpointName(e.target.value)}
              placeholder="Incoming Webhook"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Webhook URL</label>
            <Input
              className="w-full font-mono text-sm"
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              placeholder="https://example.com/incoming-email"
              required
            />
            <p className="text-xs text-muted mt-1">
              Incoming emails will be forwarded as HTTP POST requests to this URL.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Route Name</label>
            <Input
              className="w-full"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="Catch All"
            />
          </div>

          {error && <div className="text-sm text-red bg-red/10 rounded-lg px-3 py-2">{error}</div>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading || !endpointUrl.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Setting up...' : 'Set Up Incoming & Continue'}
            </Button>
            <Button type="button" variant="secondary" onClick={onBack}>
              Back
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

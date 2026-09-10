'use client';

import { useState, useEffect } from 'react';
import type { WizardState } from '../wizard-client';
import { getDomainSetup, checkDomainDns, getDomain } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CheckPill } from '@/components/ui/pill';
import { Loader2, CheckCircle2, RefreshCw } from 'lucide-react';
import { CopyableValue } from '@/components/ui/copy-button';
import { StepIntro } from './step-intro';

interface Props {
  state: WizardState;
  updateState: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

interface DnsSetup {
  domain: string;
  spf: string;
  dkim: string;
  mx: string;
  return_path: string;
  verification_token?: string;
}

export default function StepDns({ state, updateState, onNext, onBack }: Props) {
  const [setup, setSetup] = useState<DnsSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [dnsStatus, setDnsStatus] = useState<Record<string, string>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      if (!state.orgPermalink || !state.serverId || !state.domainId) return;
      try {
        const [domainData, dnsData] = await Promise.allSettled([
          getDomain(state.orgPermalink!, String(state.serverId!), String(state.domainId!)),
          getDomainSetup(state.orgPermalink, String(state.serverId), String(state.domainId)),
        ]);
        if (dnsData.status === 'fulfilled') {
          setSetup(dnsData.value);
        }
        if (domainData.status === 'fulfilled') {
          const d = domainData.value.domain;
          if (d) {
            setDnsStatus({
              spf: d.spf_status,
              dkim: d.dkim_status,
              mx: d.mx_status,
              return_path: d.return_path_status,
            });
          }
        }
      } catch {}
      setLoading(false);
    }
    init();
  }, [state.orgPermalink, state.serverId, state.domainId]);

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {}
  };

  const handleCheckDns = async () => {
    if (!state.orgPermalink || !state.serverId || !state.domainId) return;
    setChecking(true);
    try {
      const result = await checkDomainDns(
        state.orgPermalink,
        String(state.serverId),
        String(state.domainId),
      );
      setDnsStatus({
        spf: result.spf_status,
        dkim: result.dkim_status,
        mx: result.mx_status,
        return_path: result.return_path_status,
      });
    } catch {}
    setChecking(false);
  };

  if (loading) {
    return <div className="text-sm text-muted">Loading DNS setup...</div>;
  }

  if (!setup) {
    return (
      <div className="space-y-5 max-w-lg">
        <p className="text-sm text-muted">
          Unable to load DNS setup details. You can skip this step and configure DNS later.
        </p>
        <div className="flex gap-3 pt-2">
          <Button onClick={onNext}>Skip & Continue</Button>
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  const records: { label: string; value: string; field: string }[] = [];
  if (setup.verification_token) {
    records.push({
      label: 'Verification Token (TXT)',
      value: setup.verification_token,
      field: 'verification',
    });
  }
  if (setup.spf) records.push({ label: 'SPF (TXT)', value: setup.spf, field: 'spf' });
  if (setup.dkim) records.push({ label: 'DKIM (TXT)', value: setup.dkim, field: 'dkim' });
  if (setup.mx) records.push({ label: 'MX Record', value: setup.mx, field: 'mx' });
  if (setup.return_path)
    records.push({ label: 'Return-Path (CNAME)', value: setup.return_path, field: 'return_path' });

  const allOk = dnsStatus.spf === 'OK' && dnsStatus.dkim === 'OK' && dnsStatus.mx === 'OK';

  return (
    <div className="space-y-5 max-w-2xl">
      <StepIntro
        title="Publish your DNS records"
        needs="access to wherever this domain's DNS is managed — your registrar, Cloudflare, Route 53, and so on."
        next="Posta checks whether each record has propagated. You can leave and come back."
      >
        Copy each record below into your DNS provider. These are what let receiving servers verify
        the mail is really from you: without them, most inboxes will treat your messages as spam or
        reject them outright. Propagation is usually minutes but can take up to 48 hours, so it is
        normal for this step to stay amber for a while.
      </StepIntro>
      {/* Verification token */}
      {setup.verification_token && (
        <div className="rounded-lg border border-amber/30 bg-amber/5 p-4">
          <p className="text-sm font-medium text-amber mb-1">Domain Verification Required</p>
          <p className="text-xs text-muted mb-3">
            Add this TXT record to your domain to prove ownership:
          </p>
          <CopyableValue value={setup.verification_token} label="verification token" />
        </div>
      )}

      {/* DNS Records */}
      <div className="space-y-3">
        {records.map((r) => {
          const status = dnsStatus[r.field as keyof typeof dnsStatus];
          return (
            <div key={r.field} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">{r.label}</span>
                {status && <CheckPill status={status} />}
              </div>
              <CopyableValue value={r.value} label={`${r.field} record`} />
            </div>
          );
        })}
      </div>

      {/* Check DNS */}
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={handleCheckDns} disabled={checking}>
          {checking ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {checking ? 'Checking...' : 'Check DNS'}
        </Button>
        {allOk && (
          <span className="flex items-center gap-1 text-sm text-green">
            <CheckCircle2 className="h-4 w-4" /> All records verified
          </span>
        )}
      </div>

      <p className="text-xs text-muted">
        DNS changes can take up to 48 hours to propagate. You can continue without verification and
        come back later.
      </p>

      <div className="flex gap-3 pt-2">
        <Button onClick={onNext}>{allOk ? 'Continue' : 'Skip Verification & Continue'}</Button>
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}

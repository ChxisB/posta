'use client';

import { useState } from 'react';
import { checkDomainDns, getDomainSetup, provisionDomain } from '@/lib/api';
import { DnsRecords } from './dns-records';
import { INBOUND_SMTP, RegionPicker } from './region-picker';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';

export function DomainDnsPanel({ org, serverId, domainId, initialSetup, initialDomain }: {
  org: string; serverId: string; domainId: string; initialSetup: any; initialDomain: any;
}) {
  const [setup, setSetup] = useState(initialSetup);
  const [domain, setDomain] = useState(initialDomain);
  const [region, setRegion] = useState(initialDomain.ses_region ?? '');
  const [inboundRegion, setInboundRegion] = useState('');
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(!!initialDomain.verified_at);
  const receives = domain.incoming !== 0;
  async function run(provision = false) {
    setBusy(true); setError('');
    try {
      if (provision) {
        const result = await provisionDomain(org, serverId, domainId, region, receives ? inboundRegion : undefined);
        setDomain(result.domain); setVerified(false);
        setSetup(await getDomainSetup(org, serverId, domainId));
      } else {
        const result = await checkDomainDns(org, serverId, domainId);
        setVerified(result.verified);
        setStatuses({ spf: result.spf_status, dkim: result.dkim_status, mx: result.mx_status, return_path: result.return_path_status });
        if (result.records) setSetup((old: any) => ({ ...old, records: result.records }));
      }
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <div className="max-w-3xl space-y-5">
    {error && <Callout tone="danger">{error}</Callout>}
    <RegionPicker
      org={org}
      value={region}
      onChange={setRegion}
      locked={!!domain.ses_region}
      inbound={receives ? {
        value: domain.ses_region ? (domain.ses_inbound_region || INBOUND_SMTP) : inboundRegion,
        onChange: setInboundRegion,
        locked: !!domain.ses_region,
      } : undefined}
    />
    {!domain.ses_region && region && <Callout tone="info" title="Connect this domain to AWS SES">
      <p className="mb-3">
        Register the sending identity in the selected region, then publish its DNS records. Existing inbound routes keep working,
        and this domain’s current MX record stays valid until you replace it.
      </p>
      <Button onClick={() => run(true)} loading={busy}>Connect to SES</Button>
    </Callout>}
    {domain.ses_region && <Callout tone={verified ? 'success' : 'warning'}>
      {verified ? `Verified for sending in ${domain.ses_region}.` : 'Publish the sending records below, then check verification.'}
      {domain.ses_inbound_region
        ? ` SES receives this domain’s mail in ${domain.ses_inbound_region}: publish the MX record below on ${domain.name} to switch over. Posta’s SMTP server keeps accepting the domain’s mail until you do, so nothing is lost while the record propagates.`
        : ' The MX records on the domain itself route inbound mail to Posta’s SMTP server.'}
      {' '}The return-path MX record belongs on the bounce subdomain.
    </Callout>}
    {setup.records?.length ? <DnsRecords records={setup.records} statuses={statuses} /> : <>
      <p className="text-sm text-muted">Publish the ownership TXT token at posta-verification.{domain.name}, then check DNS.</p>
      <pre className="overflow-auto rounded-lg border border-line p-4 text-xs">{setup.verification_token}</pre>
      <p className="text-sm text-muted">Inbound MX: {setup.mx}</p>
    </>}
    <Button onClick={() => run()} loading={busy}>Check DNS and verification</Button>
  </div>;
}

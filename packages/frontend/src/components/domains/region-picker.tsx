'use client';

import { useEffect, useState } from 'react';
import { getSesRegions } from '@/lib/api';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Callout } from '@/components/ui/callout';

/** Sent as `inbound_region` to keep a domain on Posta's own SMTP server. */
export const INBOUND_SMTP = 'smtp';

export interface InboundChoice {
  /** '' lets Posta decide (the sending region when it can receive), INBOUND_SMTP or a region name choose explicitly. */
  value: string;
  onChange: (value: string) => void;
  locked?: boolean;
}

export function RegionPicker({ org, value, onChange, locked = false, inbound }: {
  org: string; value: string; onChange: (region: string) => void; locked?: boolean; inbound?: InboundChoice;
}) {
  const [regions, setRegions] = useState<Array<{ region: string; sandbox?: boolean; available: boolean }>>([]);
  const [inboundRegions, setInboundRegions] = useState<string[]>([]);
  const [inboundProvider, setInboundProvider] = useState('');
  const [error, setError] = useState('');
  const [provider, setProvider] = useState('');
  useEffect(() => {
    let active = true;
    getSesRegions(org).then((data) => {
      if (!active) return;
      setProvider(data.provider);
      setRegions(data.regions);
      setInboundProvider(data.inbound_provider ?? '');
      setInboundRegions(data.inbound_regions ?? []);
      if (!value && data.default_region) onChange(data.default_region);
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [org]); // eslint-disable-line react-hooks/exhaustive-deps
  if (provider === 'smtp') return null;

  // Only regions with an inbound bucket can receive; a domain elsewhere is received by Posta's SMTP server.
  const sendingCanReceive = inboundRegions.includes(value);
  const showInbound = !!inbound && (inbound.locked || (inboundProvider === 'ses' && inboundRegions.length > 0));
  const inboundOptions: Array<{ value: string; label: string }> = [];
  if (inbound?.locked) {
    inboundOptions.push({ value: inbound.value, label: inbound.value === INBOUND_SMTP ? 'Posta SMTP server' : inbound.value });
  } else {
    inboundOptions.push({ value: '', label: sendingCanReceive ? `Same as sending region (${value})` : 'Posta SMTP server' });
    inboundRegions.filter((r) => !(sendingCanReceive && r === value)).forEach((r) => inboundOptions.push({ value: r, label: `${r} — received by SES` }));
    if (sendingCanReceive) inboundOptions.push({ value: INBOUND_SMTP, label: 'Posta SMTP server' });
  }

  return <>
    {error && <Callout tone="danger">Could not load AWS regions: {error}</Callout>}
    <Field label="AWS region" hint={locked
      ? 'This domain keeps the region selected when it was added.'
      : 'Choose where this domain sends mail. Other domains can use different regions.'}>
      <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={locked || !regions.length}>
        {!regions.length && <option value={value}>{value || 'Loading regions…'}</option>}
        {regions.map((item) => <option key={item.region} value={item.region}>
          {item.region}{!item.available ? ' — unavailable' : item.sandbox ? ' — sandbox' : ''}
        </option>)}
      </Select>
    </Field>
    {!!regions.find((r) => r.region === value)?.sandbox && <p className="text-xs text-muted">
      This region is in the SES sandbox. It can send only to verified recipients until AWS grants production access.
    </p>}
    {showInbound && inbound && <Field label="Receive mail in" hint={inbound.locked
      ? 'This domain keeps the receiving setup selected when it was added.'
      : 'SES can receive this domain’s mail without a public port 25. A region that cannot receive can still send; pick another region here, or keep the domain on Posta’s SMTP server.'}>
      <Select value={inbound.value} onChange={(e) => inbound.onChange(e.target.value)} disabled={inbound.locked}>
        {inboundOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
    </Field>}
  </>;
}

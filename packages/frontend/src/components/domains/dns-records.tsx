'use client';

import { CopyableValue } from '@/components/ui/copy-button';
import { CheckPill } from '@/components/ui/pill';

export interface DomainDnsRecord {
  type: string; name: string; value: string; priority?: number; purpose: string; status?: string;
}

export function DnsRecords({ records, statuses = {} }: {
  records: DomainDnsRecord[]; statuses?: Record<string, string>;
}) {
  return <div className="space-y-3">{records.map((record) => <div
    key={`${record.type}:${record.name}:${record.value}`} className="rounded-lg border border-line p-4">
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{record.type} · {record.purpose === 'mx' ? 'Inbound mail' : record.purpose === 'return_path' ? 'SES return path' : record.purpose.toUpperCase()}</span>
      {(record.status || statuses[record.purpose]) && <CheckPill status={record.status ?? statuses[record.purpose]} />}
    </div>
    <p className="mb-1 text-xs text-muted">Name</p>
    <CopyableValue value={record.name} label="record name" />
    <p className="mb-1 mt-3 text-xs text-muted">Value{record.priority !== undefined ? ` (priority ${record.priority})` : ''}</p>
    <CopyableValue value={record.value} label="record value" />
  </div>)}</div>;
}

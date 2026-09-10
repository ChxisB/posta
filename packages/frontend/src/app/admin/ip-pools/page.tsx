import { Network } from 'lucide-react';
import { getIpPools } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { FlagPill } from '@/components/ui/pill';

export const dynamic = 'force-dynamic';

interface IpPool {
  id: number;
  name?: string;
  default?: boolean;
  ip_addresses?: unknown[];
}

const COLUMNS: Column<IpPool>[] = [
  { key: 'name', header: 'Name', primary: true, cell: (p) => p.name ?? '—' },
  {
    key: 'default',
    header: 'Default',
    cell: (p) => <FlagPill on={!!p.default} onLabel="Default" offLabel="No" />,
  },
  {
    key: 'addresses',
    header: 'Addresses',
    cell: (p) => <span className="tabular-nums text-muted">{p.ip_addresses?.length ?? 0}</span>,
  },
];

export default async function IpPoolsPage() {
  let pools: IpPool[] = [];
  let error: unknown = null;
  try {
    pools = (await getIpPools()).ip_pools;
  } catch (err) {
    error = err;
  }

  return (
    <>
      <PageHeader
        title="IP pools"
        description="Groups of outbound addresses that servers send from. Organisations are assigned a pool by the IP pool rules on their overview page."
        actions={
          <ButtonLink href="/admin/ip-pools/new" variant="primary">
            New pool
          </ButtonLink>
        }
      />
      <Card>
        <div className="px-6 pb-1">
          <DataTable
            rows={pools}
            columns={COLUMNS}
            getRowKey={(p) => String(p.id)}
            rowHref={(p) => `/admin/ip-pools/${p.id}`}
            getRowLabel={(p) => `Edit pool ${p.name ?? p.id}`}
            error={
              error ? (
                <ErrorState error={error} what="the IP pools" retryHref="/admin/ip-pools" />
              ) : undefined
            }
            empty={
              <EmptyState
                icon={Network}
                title="No IP pools yet"
                description="Create a pool and add outbound addresses to it before assigning it to an organisation."
                action={
                  <ButtonLink href="/admin/ip-pools/new" variant="primary" size="sm">
                    New pool
                  </ButtonLink>
                }
              />
            }
          />
        </div>
      </Card>
    </>
  );
}

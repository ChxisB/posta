import { Activity, Plus } from 'lucide-react';
import { getEndpoints } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { BackLink } from '@/components/ui/back-link';
import { Card, CardHeader } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { FlagPill, KindTag } from '@/components/ui/pill';

export const dynamic = 'force-dynamic';

interface HttpEndpoint {
  id: number;
  name?: string;
  url?: string;
  format?: string;
  strip_replies?: boolean;
}
interface SmtpEndpoint {
  id: number;
  name?: string;
  hostname?: string;
  port?: number;
  ssl_mode?: string;
}
interface AddressEndpoint {
  id: number;
  name?: string;
  email?: string;
}

export default async function EndpointsPage({
  params: p,
}: {
  params: Promise<{ permalink: string; serverId: string }>;
}) {
  const { permalink, serverId } = await p;
  const base = `/organizations/${permalink}/servers/${serverId}`;

  let http: HttpEndpoint[] = [];
  let smtp: SmtpEndpoint[] = [];
  let address: AddressEndpoint[] = [];
  let error: unknown = null;
  try {
    const d = await getEndpoints(permalink, serverId);
    http = d.http_endpoints ?? [];
    smtp = d.smtp_endpoints ?? [];
    address = d.address_endpoints ?? [];
  } catch (err) {
    error = err;
  }

  const httpColumns: Column<HttpEndpoint>[] = [
    {
      key: 'name',
      header: 'Name',
      primary: true,
      cell: (e) => <span className="font-medium">{e.name}</span>,
    },
    {
      key: 'url',
      header: 'URL',
      className: 'max-w-xs truncate',
      cell: (e) => <span className="font-mono text-xs text-muted">{e.url}</span>,
    },
    { key: 'format', header: 'Format', cell: (e) => <KindTag>{e.format ?? 'JSON'}</KindTag> },
    {
      key: 'strip',
      header: 'Strip replies',
      cell: (e) => <FlagPill on={!!e.strip_replies} onLabel="Yes" offLabel="No" />,
    },
  ];

  const smtpColumns: Column<SmtpEndpoint>[] = [
    {
      key: 'name',
      header: 'Name',
      primary: true,
      cell: (e) => <span className="font-medium">{e.name}</span>,
    },
    { key: 'host', header: 'Host', cell: (e) => <span className="text-muted">{e.hostname}</span> },
    {
      key: 'port',
      header: 'Port',
      cell: (e) => <span className="tabular-nums text-muted">{e.port ?? 25}</span>,
    },
    { key: 'ssl', header: 'SSL', cell: (e) => <KindTag>{e.ssl_mode ?? 'Auto'}</KindTag> },
  ];

  const addressColumns: Column<AddressEndpoint>[] = [
    {
      key: 'name',
      header: 'Name',
      primary: true,
      cell: (e) => <span className="font-medium">{e.name}</span>,
    },
    { key: 'email', header: 'Email', cell: (e) => <span className="text-muted">{e.email}</span> },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={<BackLink href={base}>Server</BackLink>}
        title="Endpoints"
        description="Where routed mail is delivered. Routes point at one of these, so an endpoint has to exist before a route can use it."
        actions={
          <>
            <ButtonLink href={`${base}/endpoints/new?type=http`} variant="primary">
              <Plus size={15} aria-hidden /> HTTP
            </ButtonLink>
            <ButtonLink href={`${base}/endpoints/new?type=smtp`} variant="secondary">
              <Plus size={15} aria-hidden /> SMTP
            </ButtonLink>
            <ButtonLink href={`${base}/endpoints/new?type=address`} variant="secondary">
              <Plus size={15} aria-hidden /> Address
            </ButtonLink>
          </>
        }
      />

      {error ? (
        <Card>
          <ErrorState error={error} what="these endpoints" retryHref={`${base}/endpoints`} />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              title="HTTP endpoints"
              description="Posta POSTs the message to a URL you control."
            />
            <div className="px-6 pb-1">
              <DataTable
                rows={http}
                columns={httpColumns}
                getRowKey={(e) => String(e.id)}
                rowHref={(e) => `${base}/endpoints/${e.id}?type=http`}
                getRowLabel={(e) => `Edit HTTP endpoint ${e.name}`}
                empty={
                  <EmptyState
                    icon={Activity}
                    title="No HTTP endpoints"
                    action={
                      <ButtonLink
                        href={`${base}/endpoints/new?type=http`}
                        variant="primary"
                        size="sm"
                      >
                        <Plus size={14} aria-hidden /> Add HTTP endpoint
                      </ButtonLink>
                    }
                  />
                }
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="SMTP endpoints"
              description="Relay the message on to another mail server."
            />
            <div className="px-6 pb-1">
              <DataTable
                rows={smtp}
                columns={smtpColumns}
                getRowKey={(e) => String(e.id)}
                rowHref={(e) => `${base}/endpoints/${e.id}?type=smtp`}
                getRowLabel={(e) => `Edit SMTP endpoint ${e.name}`}
                empty={
                  <EmptyState
                    icon={Activity}
                    title="No SMTP endpoints"
                    action={
                      <ButtonLink
                        href={`${base}/endpoints/new?type=smtp`}
                        variant="primary"
                        size="sm"
                      >
                        <Plus size={14} aria-hidden /> Add SMTP endpoint
                      </ButtonLink>
                    }
                  />
                }
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Address endpoints"
              description="Forward the message to an ordinary mailbox."
            />
            <div className="px-6 pb-1">
              <DataTable
                rows={address}
                columns={addressColumns}
                getRowKey={(e) => String(e.id)}
                rowHref={(e) => `${base}/endpoints/${e.id}?type=address`}
                getRowLabel={(e) => `Edit address endpoint ${e.name}`}
                empty={
                  <EmptyState
                    icon={Activity}
                    title="No address endpoints"
                    action={
                      <ButtonLink
                        href={`${base}/endpoints/new?type=address`}
                        variant="primary"
                        size="sm"
                      >
                        <Plus size={14} aria-hidden /> Add address endpoint
                      </ButtonLink>
                    }
                  />
                }
              />
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

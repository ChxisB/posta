'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { Code2, Plus, Trash2 } from 'lucide-react';
import { getRoutes, createRoute, deleteRoute, getDomains } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { BackLink } from '@/components/ui/back-link';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Button, ButtonLink, IconButton } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { KindTag } from '@/components/ui/pill';
import { useToast } from '@/components/providers/toast-provider';

interface Route {
  id: number;
  name?: string;
  domain_id?: number;
  mode?: string;
  spam_mode?: string;
  endpoint_type?: string;
}

interface Domain {
  id: number;
  name?: string;
}

export default function RoutesPage({
  params: paramsPromise,
}: {
  params: Promise<{ permalink: string; serverId: string }>;
}) {
  const { permalink, serverId } = use(paramsPromise);
  const toast = useToast();
  const base = `/organizations/${permalink}/servers/${serverId}`;

  const [routes, setRoutes] = useState<Route[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    domain_id: '',
    endpoint_type: 'HTTPEndpoint',
    endpoint_host: '',
  });

  const [pendingDelete, setPendingDelete] = useState<Route | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [routeData, domainData] = await Promise.all([
        getRoutes(permalink, serverId),
        getDomains(permalink, serverId),
      ]);
      setRoutes(routeData.routes ?? []);
      setDomains(domainData.domains ?? []);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [permalink, serverId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    try {
      await createRoute(permalink, serverId, form);
      setShowForm(false);
      setForm({ name: '', domain_id: '', endpoint_type: 'HTTPEndpoint', endpoint_host: '' });
      toast('success', 'Route created.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the route.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteRoute(permalink, serverId, String(pendingDelete.id));
      setPendingDelete(null);
      toast('success', `${pendingDelete.name} deleted.`);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the route.');
    } finally {
      setDeleting(false);
    }
  }

  // The API returns a domain id; an operator thinks in domain names.
  const domainName = (id?: number) => domains.find((d) => d.id === id)?.name ?? '—';

  const columns: Column<Route>[] = [
    {
      key: 'name',
      header: 'Name',
      primary: true,
      cell: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: 'domain',
      header: 'Domain',
      cell: (r) => <span className="text-muted">{domainName(r.domain_id)}</span>,
    },
    { key: 'mode', header: 'Mode', cell: (r) => <KindTag>{r.mode ?? 'Normal'}</KindTag> },
    {
      key: 'spam',
      header: 'Spam mode',
      cell: (r) => <span className="text-muted">{r.spam_mode ?? '—'}</span>,
    },
    {
      key: 'endpoint',
      header: 'Endpoint',
      cell: (r) => <span className="text-muted">{r.endpoint_type ?? '—'}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-12 text-right',
      hideOnCard: true,
      cell: (r) => (
        <IconButton
          label={`Delete ${r.name}`}
          size="sm"
          variant="ghost"
          onClick={() => setPendingDelete(r)}
          className="text-faint hover:text-red"
        >
          <Trash2 size={14} />
        </IconButton>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={<BackLink href={base}>Server</BackLink>}
        title="Routes"
        description="What happens to incoming mail. A route matches an address on one of your domains and hands the message to an endpoint."
        actions={
          <Button
            variant="primary"
            onClick={() => setShowForm((v) => !v)}
            disabled={domains.length === 0}
          >
            <Plus size={15} aria-hidden /> New route
          </Button>
        }
      />

      {/* A route needs a domain to match against, so say so rather than
          offering a form whose domain picker would be empty. */}
      {!loading && !loadError && domains.length === 0 && (
        <Callout
          tone="warning"
          title="Add a domain first"
          action={
            <ButtonLink href={`${base}/domains`} variant="secondary" size="sm">
              Domains
            </ButtonLink>
          }
        >
          A route matches addresses on one of this server&apos;s domains, so there is nothing to
          route until at least one exists.
        </Callout>
      )}

      {showForm && domains.length > 0 && (
        <Card className="max-w-xl">
          <CardHeader title="New route" />
          <CardBody>
            <form onSubmit={handleCreate} className="flex flex-col gap-5">
              {formError && <Callout tone="danger">{formError}</Callout>}
              <Field label="Name" required hint="The local part to match, or a wildcard.">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="support"
                  required
                />
              </Field>
              <Field label="Domain" required>
                <Select
                  value={form.domain_id}
                  onChange={(e) => setForm({ ...form, domain_id: e.target.value })}
                  required
                >
                  <option value="">Choose a domain</option>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Endpoint type">
                <Select
                  value={form.endpoint_type}
                  onChange={(e) => setForm({ ...form, endpoint_type: e.target.value })}
                >
                  <option value="HTTPEndpoint">HTTP endpoint</option>
                  <option value="SMTPEndpoint">SMTP endpoint</option>
                  <option value="AddressEndpoint">Forward to address</option>
                </Select>
              </Field>
              <Field label="Endpoint" required hint="Where matching mail is delivered.">
                <Input
                  value={form.endpoint_host}
                  onChange={(e) => setForm({ ...form, endpoint_host: e.target.value })}
                  placeholder="https://example.com/inbound"
                  required
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  loading={creating}
                  disabled={!form.name.trim() || !form.domain_id}
                >
                  Create route
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <Card>
        <div className="px-6 pb-1">
          <DataTable
            rows={routes}
            columns={columns}
            getRowKey={(r) => String(r.id)}
            rowHref={(r) => `${base}/routes/${r.id}`}
            getRowLabel={(r) => `Edit route ${r.name}`}
            loading={loading}
            error={
              loadError ? (
                <ErrorState error={loadError} what="these routes" retryHref={`${base}/routes`} />
              ) : undefined
            }
            empty={
              <EmptyState
                icon={Code2}
                title="No routes yet"
                description="Incoming mail for this server's domains has nowhere to go until a route exists."
                action={
                  domains.length > 0 ? (
                    <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
                      <Plus size={14} aria-hidden /> New route
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </div>
      </Card>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete route"
          description={
            <>
              Mail matching <strong className="text-foreground">{pendingDelete.name}</strong> on{' '}
              {domainName(pendingDelete.domain_id)} will stop being forwarded, and will be rejected
              instead.
            </>
          }
          confirmLabel="Delete route"
          destructive
          loading={deleting}
          error={deleteError}
          onConfirm={handleDelete}
          onClose={() => {
            setPendingDelete(null);
            setDeleteError(null);
          }}
        />
      )}
    </>
  );
}

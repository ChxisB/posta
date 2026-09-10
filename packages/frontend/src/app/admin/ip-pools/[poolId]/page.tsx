'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { Network, Plus, Trash2 } from 'lucide-react';
import { getIpPool, getIpAddresses, createIpAddress, deleteIpAddress } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { BackLink } from '@/components/ui/back-link';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Button, IconButton } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Input, CodeInput } from '@/components/ui/input';
import { FlagPill, KindTag } from '@/components/ui/pill';
import { useToast } from '@/components/providers/toast-provider';

interface IpAddress {
  id: number;
  ip?: string;
  hostname?: string;
}

interface Pool {
  id?: number;
  name?: string;
  default?: boolean;
}

export default function IpPoolDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = use(paramsPromise);
  const toast = useToast();

  const [pool, setPool] = useState<Pool>({});
  const [addresses, setAddresses] = useState<IpAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ ip: '', hostname: '' });

  const [pendingDelete, setPendingDelete] = useState<IpAddress | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [poolData, addrData] = await Promise.all([getIpPool(poolId), getIpAddresses(poolId)]);
      setPool(poolData.ip_pool ?? {});
      setAddresses(addrData.ip_addresses ?? []);
    } catch (err) {
      // Both fetches used to have their own bare `catch {}`, so a failure on
      // either left the page rendering an unnamed pool with no addresses.
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [poolId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    try {
      await createIpAddress(poolId, formData);
      setShowForm(false);
      setFormData({ ip: '', hostname: '' });
      toast('success', `${formData.ip} added to the pool.`);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add the address.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteIpAddress(poolId, String(pendingDelete.id));
      setPendingDelete(null);
      toast('success', `${pendingDelete.ip} removed from the pool.`);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not remove the address.');
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<IpAddress>[] = [
    {
      key: 'ip',
      header: 'IP address',
      primary: true,
      cell: (a) => <KindTag>{a.ip}</KindTag>,
    },
    {
      key: 'hostname',
      header: 'Reverse hostname',
      cell: (a) => <span className="text-muted">{a.hostname || '—'}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-12 text-right',
      hideOnCard: true,
      cell: (a) => (
        <IconButton
          label={`Remove ${a.ip}`}
          size="sm"
          variant="ghost"
          onClick={() => setPendingDelete(a)}
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
        breadcrumb={<BackLink href="/admin/ip-pools">IP pools</BackLink>}
        title={pool.name ?? 'IP pool'}
        description="Servers assigned to this pool send from these addresses. Reverse DNS on each one should match its hostname, or receiving servers will treat the mail as suspicious."
        actions={
          <>
            {pool.default !== undefined && (
              <FlagPill on={!!pool.default} onLabel="Default pool" offLabel="Not default" />
            )}
            <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
              <Plus size={15} aria-hidden /> Add address
            </Button>
          </>
        }
      />

      {showForm && (
        <Card className="max-w-xl">
          <CardHeader title="Add IP address" />
          <CardBody>
            <form onSubmit={handleCreate} className="flex flex-col gap-5">
              {formError && <Callout tone="danger">{formError}</Callout>}
              <Field label="IP address" required>
                <CodeInput
                  value={formData.ip}
                  onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                  placeholder="203.0.113.10"
                  required
                />
              </Field>
              <Field
                label="Reverse hostname"
                hint="The PTR record this address resolves to. Optional, but recommended."
              >
                <Input
                  value={formData.hostname}
                  onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                  placeholder="mail.example.com"
                />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" variant="primary" loading={creating}>
                  Add address
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
        <CardHeader title="Addresses" description={`${addresses.length} in this pool.`} />
        <div className="px-6 pb-1">
          <DataTable
            rows={addresses}
            columns={columns}
            getRowKey={(a) => String(a.id)}
            loading={loading}
            error={
              loadError ? (
                <ErrorState
                  error={loadError}
                  what="this pool"
                  retryHref={`/admin/ip-pools/${poolId}`}
                />
              ) : undefined
            }
            empty={
              <EmptyState
                icon={Network}
                title="No addresses in this pool"
                description="A pool with no addresses cannot send. Add at least one before assigning it to an organisation."
                action={
                  <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
                    <Plus size={14} aria-hidden /> Add address
                  </Button>
                }
              />
            }
          />
        </div>
      </Card>

      {pendingDelete && (
        <ConfirmDialog
          title="Remove IP address"
          description={
            <>
              This removes <strong className="text-foreground">{pendingDelete.ip}</strong> from{' '}
              {pool.name ?? 'this pool'}. Mail already queued against it will be re-assigned to the
              pool&apos;s other addresses.
            </>
          }
          confirmLabel="Remove address"
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

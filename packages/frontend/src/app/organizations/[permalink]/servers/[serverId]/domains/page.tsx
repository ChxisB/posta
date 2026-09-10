'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { Globe, Plus, Trash2 } from 'lucide-react';
import { getDomains, createDomain, deleteDomain } from '@/lib/api';
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
import { Input } from '@/components/ui/input';
import { CheckPill, FlagPill } from '@/components/ui/pill';
import { useToast } from '@/components/providers/toast-provider';

interface Domain {
  id: number;
  name?: string;
  verified_at?: string | null;
  spf_status?: string;
  dkim_status?: string;
  mx_status?: string;
}

export default function DomainsPage({
  params: paramsPromise,
}: {
  params: Promise<{ permalink: string; serverId: string }>;
}) {
  const { permalink, serverId } = use(paramsPromise);
  const toast = useToast();
  const base = `/organizations/${permalink}/servers/${serverId}`;

  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState('');

  const [pendingDelete, setPendingDelete] = useState<Domain | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setDomains((await getDomains(permalink, serverId)).domains ?? []);
    } catch (err) {
      // Was `catch {}`, which made an unreachable API render as "No domains
      // added yet" — sending the operator off to re-add a domain that was
      // already there and already verified.
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
      await createDomain(permalink, serverId, { name });
      setShowForm(false);
      setName('');
      toast('success', `${name} added. Publish its DNS records to verify it.`);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add the domain.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDomain(permalink, serverId, String(pendingDelete.id));
      setPendingDelete(null);
      toast('success', `${pendingDelete.name} removed.`);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not remove the domain.');
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<Domain>[] = [
    {
      key: 'name',
      header: 'Domain',
      primary: true,
      cell: (d) => <span className="font-medium">{d.name}</span>,
    },
    {
      key: 'verified',
      header: 'Status',
      // "Pending" is a problem worth acting on, not a neutral off-switch:
      // an unverified domain cannot authenticate the mail it sends.
      cell: (d) => (
        <FlagPill on={!!d.verified_at} onLabel="Verified" offLabel="Pending" tone="bad" />
      ),
    },
    { key: 'spf', header: 'SPF', cell: (d) => <CheckPill status={d.spf_status} /> },
    { key: 'dkim', header: 'DKIM', cell: (d) => <CheckPill status={d.dkim_status} /> },
    { key: 'mx', header: 'MX', cell: (d) => <CheckPill status={d.mx_status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-12 text-right',
      hideOnCard: true,
      cell: (d) => (
        <IconButton
          label={`Delete ${d.name}`}
          size="sm"
          variant="ghost"
          onClick={() => setPendingDelete(d)}
          className="text-faint hover:text-red"
        >
          <Trash2 size={14} />
        </IconButton>
      ),
    },
  ];

  const unverified = domains.filter((d) => !d.verified_at).length;

  return (
    <>
      <PageHeader
        breadcrumb={<BackLink href={base}>Server</BackLink>}
        title="Domains"
        description="The domains this server may send as. Each one needs SPF, DKIM and MX records published before it will authenticate."
        actions={
          <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
            <Plus size={15} aria-hidden /> Add domain
          </Button>
        }
      />

      {!loading && !loadError && unverified > 0 && (
        <Callout tone="warning" title="Unverified domains">
          {unverified === 1
            ? 'One domain has not verified yet.'
            : `${unverified} domains have not verified yet.`}{' '}
          Mail sent from an unverified domain is likely to be rejected or filtered. Open a domain to
          see which records are still missing.
        </Callout>
      )}

      {showForm && (
        <Card className="max-w-xl">
          <CardHeader
            title="Add domain"
            description="You will need to publish DNS records for it afterwards."
          />
          <CardBody>
            <form onSubmit={handleCreate} className="flex flex-col gap-5">
              {formError && <Callout tone="danger">{formError}</Callout>}
              <Field
                label="Domain name"
                required
                hint="The domain mail will be sent from, e.g. mail.example.com."
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="mail.example.com"
                  required
                />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" variant="primary" loading={creating} disabled={!name.trim()}>
                  Add domain
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
            rows={domains}
            columns={columns}
            getRowKey={(d) => String(d.id)}
            rowHref={(d) => `${base}/domains/${d.id}/setup`}
            getRowLabel={(d) => `DNS setup for ${d.name}`}
            loading={loading}
            error={
              loadError ? (
                <ErrorState error={loadError} what="these domains" retryHref={`${base}/domains`} />
              ) : undefined
            }
            empty={
              <EmptyState
                icon={Globe}
                title="No domains yet"
                description="A server cannot send until it has at least one verified domain."
                action={
                  <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
                    <Plus size={14} aria-hidden /> Add domain
                  </Button>
                }
              />
            }
          />
        </div>
      </Card>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete domain"
          description={
            <>
              This removes <strong className="text-foreground">{pendingDelete.name}</strong> and its
              DKIM key from this server. Mail can no longer be sent as this domain, and re-adding it
              generates a new key that has to be published again.
            </>
          }
          confirmLabel="Delete domain"
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

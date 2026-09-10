'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { getCredentials, createCredential, deleteCredential } from '@/lib/api';
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
import { Select } from '@/components/ui/select';
import { FlagPill, KindTag } from '@/components/ui/pill';
import { useToast } from '@/components/providers/toast-provider';

interface Credential {
  id: number;
  name?: string;
  type?: string;
  key?: string;
  hold?: boolean;
}

export default function CredentialsPage({
  params: paramsPromise,
}: {
  params: Promise<{ permalink: string; serverId: string }>;
}) {
  const { permalink, serverId } = use(paramsPromise);
  const toast = useToast();
  const base = `/organizations/${permalink}/servers/${serverId}`;

  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ type: 'SMTP', name: '', key: '' });

  const [pendingDelete, setPendingDelete] = useState<Credential | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setCredentials((await getCredentials(permalink, serverId)).credentials ?? []);
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
      await createCredential(permalink, serverId, form);
      setShowForm(false);
      setForm({ type: 'SMTP', name: '', key: '' });
      toast('success', 'Credential created.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the credential.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCredential(permalink, serverId, String(pendingDelete.id));
      setPendingDelete(null);
      toast('success', `${pendingDelete.name} deleted.`);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the credential.');
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<Credential>[] = [
    {
      key: 'name',
      header: 'Name',
      primary: true,
      cell: (c) => <span className="font-medium">{c.name}</span>,
    },
    { key: 'type', header: 'Type', cell: (c) => <KindTag>{c.type}</KindTag> },
    {
      key: 'key',
      header: 'Key',
      // Truncated on purpose: the full secret belongs on the credential's own
      // page, not in a list that may be on screen during a screen-share.
      cell: (c) => (
        <span className="font-mono text-xs text-faint">
          {c.key ? `${c.key.slice(0, 12)}…` : '—'}
        </span>
      ),
    },
    {
      key: 'hold',
      header: 'Hold',
      cell: (c) => <FlagPill on={!!c.hold} onLabel="Holding" offLabel="Sending" />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-12 text-right',
      hideOnCard: true,
      cell: (c) => (
        <IconButton
          label={`Delete ${c.name}`}
          size="sm"
          variant="ghost"
          onClick={() => setPendingDelete(c)}
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
        title="Credentials"
        description="How applications authenticate to this server. SMTP credentials go in a mail client; API keys go in the X-API-Key header."
        actions={
          <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
            <Plus size={15} aria-hidden /> New credential
          </Button>
        }
      />

      {showForm && (
        <Card className="max-w-xl">
          <CardHeader title="New credential" />
          <CardBody>
            <form onSubmit={handleCreate} className="flex flex-col gap-5">
              {formError && <Callout tone="danger">{formError}</Callout>}
              <Field label="Type">
                <Select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="SMTP">SMTP</option>
                  <option value="API">API</option>
                </Select>
              </Field>
              <Field label="Name" required hint="Name it after the application that will use it.">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Billing service"
                  required
                />
              </Field>
              <Field label="Key" hint="Leave blank and Posta generates one for you.">
                <Input
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  placeholder="Generated automatically"
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  loading={creating}
                  disabled={!form.name.trim()}
                >
                  Create credential
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
            rows={credentials}
            columns={columns}
            getRowKey={(c) => String(c.id)}
            rowHref={(c) => `${base}/credentials/${c.id}`}
            getRowLabel={(c) => `Edit credential ${c.name}`}
            loading={loading}
            error={
              loadError ? (
                <ErrorState
                  error={loadError}
                  what="these credentials"
                  retryHref={`${base}/credentials`}
                />
              ) : undefined
            }
            empty={
              <EmptyState
                icon={KeyRound}
                title="No credentials yet"
                description="Nothing can authenticate to this server until you create one."
                action={
                  <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
                    <Plus size={14} aria-hidden /> New credential
                  </Button>
                }
              />
            }
          />
        </div>
      </Card>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete credential"
          description={
            <>
              Anything still authenticating as{' '}
              <strong className="text-foreground">{pendingDelete.name}</strong> will start failing
              immediately. Check nothing is using it before deleting.
            </>
          }
          confirmLabel="Delete credential"
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

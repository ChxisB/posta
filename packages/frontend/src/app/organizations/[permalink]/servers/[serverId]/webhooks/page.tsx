'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { Plus, Trash2, Webhook as WebhookIcon } from 'lucide-react';
import { getWebhooks, createWebhook, deleteWebhook } from '@/lib/api';
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
import { FlagPill, KindTag } from '@/components/ui/pill';
import { useToast } from '@/components/providers/toast-provider';

interface WebhookRecord {
  id: number;
  name?: string;
  url?: string;
  enabled?: boolean;
  events?: string[];
}

/** The events the delivery pipeline actually emits, per message-db/delivery.ts. */
const KNOWN_EVENTS = ['MessageSent', 'MessageDelayed', 'MessageDeliveryFailed', 'MessageHeld'];

export default function WebhooksPage({
  params: paramsPromise,
}: {
  params: Promise<{ permalink: string; serverId: string }>;
}) {
  const { permalink, serverId } = use(paramsPromise);
  const toast = useToast();
  const base = `/organizations/${permalink}/servers/${serverId}`;

  const [webhooks, setWebhooks] = useState<WebhookRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', url: '', events: '' });

  const [pendingDelete, setPendingDelete] = useState<WebhookRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setWebhooks((await getWebhooks(permalink, serverId)).webhooks ?? []);
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
      await createWebhook(permalink, serverId, {
        name: form.name,
        url: form.url,
        events: form.events
          ? form.events
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      });
      setShowForm(false);
      setForm({ name: '', url: '', events: '' });
      toast('success', 'Webhook created.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the webhook.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteWebhook(permalink, serverId, String(pendingDelete.id));
      setPendingDelete(null);
      toast('success', `${pendingDelete.name} deleted.`);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the webhook.');
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<WebhookRecord>[] = [
    {
      key: 'name',
      header: 'Name',
      primary: true,
      cell: (w) => <span className="font-medium">{w.name}</span>,
    },
    {
      key: 'url',
      header: 'URL',
      className: 'max-w-xs truncate',
      cell: (w) => <span className="font-mono text-xs text-muted">{w.url}</span>,
    },
    {
      key: 'events',
      header: 'Events',
      cell: (w) =>
        w.events?.length ? (
          <span className="flex flex-wrap gap-1">
            {w.events.map((e) => (
              <KindTag key={e}>{e}</KindTag>
            ))}
          </span>
        ) : (
          // No events means the webhook fires for all of them, which is very
          // different from "not configured" and used to render as a dash.
          <span className="text-xs text-muted">All events</span>
        ),
    },
    {
      key: 'enabled',
      header: 'Enabled',
      cell: (w) => <FlagPill on={!!w.enabled} onLabel="Enabled" offLabel="Disabled" />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-12 text-right',
      hideOnCard: true,
      cell: (w) => (
        <IconButton
          label={`Delete ${w.name}`}
          size="sm"
          variant="ghost"
          onClick={() => setPendingDelete(w)}
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
        title="Webhooks"
        description="Posta posts delivery events to these URLs, with retries. Use them to keep your own records in step with what actually happened to each message."
        actions={
          <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
            <Plus size={15} aria-hidden /> New webhook
          </Button>
        }
      />

      {showForm && (
        <Card className="max-w-xl">
          <CardHeader title="New webhook" />
          <CardBody>
            <form onSubmit={handleCreate} className="flex flex-col gap-5">
              {formError && <Callout tone="danger">{formError}</Callout>}
              <Field label="Name" required>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Delivery notifications"
                  required
                />
              </Field>
              <Field
                label="URL"
                required
                hint="Posta POSTs a JSON body here and retries on failure."
              >
                <Input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://example.com/hooks/posta"
                  required
                />
              </Field>
              <Field
                label="Events"
                hint={`Comma-separated. Leave empty for all. Available: ${KNOWN_EVENTS.join(', ')}.`}
              >
                <Input
                  value={form.events}
                  onChange={(e) => setForm({ ...form, events: e.target.value })}
                  placeholder="MessageSent, MessageDeliveryFailed"
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  loading={creating}
                  disabled={!form.name.trim() || !form.url.trim()}
                >
                  Create webhook
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
            rows={webhooks}
            columns={columns}
            getRowKey={(w) => String(w.id)}
            rowHref={(w) => `${base}/webhooks/${w.id}`}
            getRowLabel={(w) => `Edit webhook ${w.name}`}
            loading={loading}
            error={
              loadError ? (
                <ErrorState
                  error={loadError}
                  what="these webhooks"
                  retryHref={`${base}/webhooks`}
                />
              ) : undefined
            }
            empty={
              <EmptyState
                icon={WebhookIcon}
                title="No webhooks yet"
                description="Without one, delivery outcomes are only visible in this dashboard."
                action={
                  <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
                    <Plus size={14} aria-hidden /> New webhook
                  </Button>
                }
              />
            }
          />
        </div>
      </Card>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete webhook"
          description={
            <>
              This stops delivery events being sent to{' '}
              <strong className="text-foreground">{pendingDelete.url}</strong>. Anything relying on
              those callbacks will stop being notified.
            </>
          }
          confirmLabel="Delete webhook"
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

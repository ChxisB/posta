'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { BarChart3, Plus, Trash2 } from 'lucide-react';
import { getTrackDomains, createTrackDomain, deleteTrackDomain } from '@/lib/api';
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
import { FlagPill } from '@/components/ui/pill';
import { useToast } from '@/components/providers/toast-provider';

interface TrackDomain {
  id: number;
  name?: string;
  ssl_enabled?: boolean;
  track_clicks?: boolean;
  track_loads?: boolean;
}

export default function TrackDomainsPage({
  params: paramsPromise,
}: {
  params: Promise<{ permalink: string; serverId: string }>;
}) {
  const { permalink, serverId } = use(paramsPromise);
  const toast = useToast();
  const base = `/organizations/${permalink}/servers/${serverId}`;

  const [trackDomains, setTrackDomains] = useState<TrackDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState('');

  const [pendingDelete, setPendingDelete] = useState<TrackDomain | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setTrackDomains((await getTrackDomains(permalink, serverId)).track_domains ?? []);
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
      await createTrackDomain(permalink, serverId, { name });
      setShowForm(false);
      setName('');
      toast('success', `${name} added.`);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add the tracking domain.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTrackDomain(permalink, serverId, String(pendingDelete.id));
      setPendingDelete(null);
      toast('success', `${pendingDelete.name} removed.`);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not remove the tracking domain.');
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<TrackDomain>[] = [
    {
      key: 'name',
      header: 'Domain',
      primary: true,
      cell: (t) => <span className="font-medium">{t.name}</span>,
    },
    {
      key: 'ssl',
      header: 'SSL',
      // SSL off IS a problem: links rewritten to an http:// tracker inside an
      // otherwise https message get flagged, and some clients refuse them.
      cell: (t) => <FlagPill on={!!t.ssl_enabled} onLabel="Enabled" offLabel="Off" tone="bad" />,
    },
    {
      key: 'clicks',
      header: 'Click tracking',
      cell: (t) => <FlagPill on={!!t.track_clicks} onLabel="On" offLabel="Off" />,
    },
    {
      key: 'loads',
      header: 'Open tracking',
      cell: (t) => <FlagPill on={!!t.track_loads} onLabel="On" offLabel="Off" />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-12 text-right',
      hideOnCard: true,
      cell: (t) => (
        <IconButton
          label={`Delete ${t.name}`}
          size="sm"
          variant="ghost"
          onClick={() => setPendingDelete(t)}
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
        title="Tracking domains"
        description="Click and open tracking is served from these domains. Using one you own means the links in your mail point at you rather than a shared tracker, which receiving servers trust more."
        actions={
          <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
            <Plus size={15} aria-hidden /> Add tracking domain
          </Button>
        }
      />

      {showForm && (
        <Card className="max-w-xl">
          <CardHeader
            title="Add tracking domain"
            description="Point a CNAME at this Posta installation before enabling SSL."
          />
          <CardBody>
            <form onSubmit={handleCreate} className="flex flex-col gap-5">
              {formError && <Callout tone="danger">{formError}</Callout>}
              <Field
                label="Domain name"
                required
                hint="A subdomain you control, e.g. track.example.com."
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="track.example.com"
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
            rows={trackDomains}
            columns={columns}
            getRowKey={(t) => String(t.id)}
            rowHref={(t) => `${base}/track-domains/${t.id}`}
            getRowLabel={(t) => `Edit tracking domain ${t.name}`}
            loading={loading}
            error={
              loadError ? (
                <ErrorState
                  error={loadError}
                  what="these tracking domains"
                  retryHref={`${base}/track-domains`}
                />
              ) : undefined
            }
            empty={
              <EmptyState
                icon={BarChart3}
                title="No tracking domains"
                description="Without one, click and open tracking is disabled for this server."
                action={
                  <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
                    <Plus size={14} aria-hidden /> Add tracking domain
                  </Button>
                }
              />
            }
          />
        </div>
      </Card>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete tracking domain"
          description={
            <>
              Removing <strong className="text-foreground">{pendingDelete.name}</strong> stops click
              and open tracking through it. Links in messages already sent that point at this domain
              will stop resolving.
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

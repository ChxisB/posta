'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Network, Plus, Trash2 } from 'lucide-react';
import { getOrgIpPoolRules, createOrgIpPoolRule, deleteOrgIpPoolRule, getIpPools } from '@/lib/api';
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

interface Rule {
  id: number;
  ip_pool_id: number;
  from_text?: string | null;
  to_text?: string | null;
}

interface Pool {
  id: number;
  name?: string;
}

export default function IpPoolRulesPage() {
  const { permalink } = useParams<{ permalink: string }>();
  const toast = useToast();

  const [rules, setRules] = useState<Rule[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ ip_pool_id: '', from_text: '', to_text: '' });

  const [pendingDelete, setPendingDelete] = useState<Rule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [ruleData, poolData] = await Promise.all([getOrgIpPoolRules(permalink), getIpPools()]);
      setRules(ruleData.ip_pool_rules ?? []);
      setPools(poolData.ip_pools ?? []);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [permalink]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    try {
      await createOrgIpPoolRule(permalink, {
        ip_pool_id: Number(form.ip_pool_id),
        from_text: form.from_text || undefined,
        to_text: form.to_text || undefined,
      });
      setShowForm(false);
      setForm({ ip_pool_id: '', from_text: '', to_text: '' });
      toast('success', 'Rule created.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the rule.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteOrgIpPoolRule(permalink, String(pendingDelete.id));
      setPendingDelete(null);
      toast('success', 'Rule deleted.');
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the rule.');
    } finally {
      setDeleting(false);
    }
  };

  const poolName = (id: number) => pools.find((p) => p.id === id)?.name ?? `Pool ${id}`;

  const columns: Column<Rule>[] = [
    {
      key: 'pool',
      header: 'Sends from',
      primary: true,
      cell: (r) => <span className="font-medium">{poolName(r.ip_pool_id)}</span>,
    },
    {
      key: 'from',
      header: 'When from matches',
      // An empty matcher means "any", which is the opposite of "nothing".
      cell: (r) =>
        r.from_text ? (
          <KindTag>{r.from_text}</KindTag>
        ) : (
          <span className="text-xs text-muted">Any sender</span>
        ),
    },
    {
      key: 'to',
      header: 'When to matches',
      cell: (r) =>
        r.to_text ? (
          <KindTag>{r.to_text}</KindTag>
        ) : (
          <span className="text-xs text-muted">Any recipient</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-12 text-right',
      hideOnCard: true,
      cell: (r) => (
        <IconButton
          label={`Delete rule for ${poolName(r.ip_pool_id)}`}
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
        breadcrumb={<BackLink href={`/organizations/${permalink}`}>Organization</BackLink>}
        title="IP pool rules"
        description="Choose which outbound addresses a message sends from, based on who it is from and who it is going to. Mail matching no rule uses the default pool."
        actions={
          <Button
            variant="primary"
            onClick={() => setShowForm((v) => !v)}
            disabled={pools.length === 0}
          >
            <Plus size={15} aria-hidden /> New rule
          </Button>
        }
      />

      {!loading && !loadError && pools.length === 0 && (
        <Callout
          tone="warning"
          title="No IP pools exist yet"
          action={
            <ButtonLink href="/admin/ip-pools" variant="secondary" size="sm">
              IP pools
            </ButtonLink>
          }
        >
          A rule assigns mail to a pool, so there is nothing to assign until an administrator
          creates one.
        </Callout>
      )}

      {showForm && pools.length > 0 && (
        <Card className="max-w-xl">
          <CardHeader
            title="New rule"
            description="Leave a matcher empty to match anything in that position."
          />
          <CardBody>
            <form onSubmit={handleCreate} className="flex flex-col gap-5">
              {formError && <Callout tone="danger">{formError}</Callout>}
              <Field label="Send from pool" required>
                <Select
                  value={form.ip_pool_id}
                  onChange={(e) => setForm({ ...form, ip_pool_id: e.target.value })}
                  required
                >
                  <option value="">Choose a pool</option>
                  {pools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="From matches"
                hint="Matched against the envelope sender. Empty means any."
              >
                <Input
                  value={form.from_text}
                  onChange={(e) => setForm({ ...form, from_text: e.target.value })}
                  placeholder="billing@example.com"
                />
              </Field>
              <Field label="To matches" hint="Matched against the recipient. Empty means any.">
                <Input
                  value={form.to_text}
                  onChange={(e) => setForm({ ...form, to_text: e.target.value })}
                  placeholder="@partner.example"
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  loading={creating}
                  disabled={!form.ip_pool_id}
                >
                  Create rule
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
            rows={rules}
            columns={columns}
            getRowKey={(r) => String(r.id)}
            loading={loading}
            error={
              loadError ? (
                <ErrorState
                  error={loadError}
                  what="these rules"
                  retryHref={`/organizations/${permalink}/ip-pool-rules`}
                />
              ) : undefined
            }
            empty={
              <EmptyState
                icon={Network}
                title="No rules yet"
                description="All mail from this organisation sends from the default pool."
                action={
                  pools.length > 0 ? (
                    <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
                      <Plus size={14} aria-hidden /> New rule
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
          title="Delete IP pool rule"
          description={
            <>
              Mail that matched this rule will fall through to the next matching rule, or to the
              default pool. It will start sending from{' '}
              <strong className="text-foreground">different IP addresses</strong>, which can affect
              deliverability while those addresses build reputation.
            </>
          }
          confirmLabel="Delete rule"
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

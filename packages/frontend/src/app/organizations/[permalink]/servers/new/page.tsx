'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { createServer, getIpPools } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { BackLink } from '@/components/ui/back-link';
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/card';
import { Button, ButtonLink } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

interface IpPool {
  id: number;
  name: string;
}

export default function NewServerPage() {
  const { permalink } = useParams<{ permalink: string }>();
  const router = useRouter();

  const [name, setName] = useState('');
  const [mode, setMode] = useState<'Live' | 'Development'>('Live');
  const [ipPoolId, setIpPoolId] = useState('');
  const [pools, setPools] = useState<IpPool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setPools((await getIpPools()).ip_pools ?? []);
      } catch {
        // A missing pool list is not fatal here: the field is optional and
        // the server falls back to the default pool. The form stays usable,
        // so this stops short of blocking the page on it.
        setPools([]);
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createServer(permalink, {
        name,
        mode,
        ...(ipPoolId ? { ip_pool_id: Number(ipPoolId) } : {}),
      });
      router.push(`/organizations/${permalink}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumb={<BackLink href={`/organizations/${permalink}`}>Organization</BackLink>}
        title="New server"
        description="A server owns the domains, credentials and routes that mail moves through."
      />

      <div className="flex max-w-2xl flex-col gap-5">
        <Callout
          tone="info"
          action={
            <ButtonLink
              href={`/organizations/setup?org=${permalink}`}
              variant="secondary"
              size="sm"
            >
              Open wizard
            </ButtonLink>
          }
        >
          <span className="flex items-center gap-2">
            <Sparkles size={14} aria-hidden className="shrink-0" />
            The setup wizard creates a server, domain and credentials in one guided flow.
          </span>
        </Callout>

        <Card>
          <CardHeader title="Details" description="Mode and IP pool can both be changed later." />
          <form onSubmit={handleSubmit}>
            <CardBody className="flex flex-col gap-5">
              {error && <Callout tone="danger">{error}</Callout>}

              <Field label="Name" required>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Transactional"
                  required
                />
              </Field>

              <Field
                label="Mode"
                hint={
                  mode === 'Development'
                    ? 'Development mode accepts and records messages but never delivers them, so it cannot affect your sending reputation.'
                    : 'Live mode delivers to real recipients.'
                }
              >
                <Select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as 'Live' | 'Development')}
                >
                  <option value="Live">Live</option>
                  <option value="Development">Development</option>
                </Select>
              </Field>

              {pools.length > 0 && (
                <Field
                  label="IP pool"
                  hint="Which outbound addresses this server sends from. Leave unset to use the default pool."
                >
                  <Select value={ipPoolId} onChange={(e) => setIpPoolId(e.target.value)}>
                    <option value="">Default pool</option>
                    {pools.map((pool) => (
                      <option key={pool.id} value={pool.id}>
                        {pool.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </CardBody>
            <CardFooter>
              <Button type="submit" variant="primary" loading={loading} disabled={!name.trim()}>
                Create server
              </Button>
              <Button type="button" variant="ghost" onClick={() => router.back()}>
                Cancel
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </>
  );
}

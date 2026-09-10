'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createIpPool } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { BackLink } from '@/components/ui/back-link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/select';

export default function NewIpPoolPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [defaultPool, setDefaultPool] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createIpPool({ name, default_pool: defaultPool });
      router.push('/admin/ip-pools');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create IP pool');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumb={<BackLink href="/admin/ip-pools">IP pools</BackLink>}
        title="New IP pool"
        description="Create the pool first, then add outbound addresses to it from the pool's own page."
      />
      <Card className="max-w-xl" padded>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && <Callout tone="danger">{error}</Callout>}

          <Field
            label="Name"
            required
            hint="Shown wherever a pool is chosen, so name it after what it sends."
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Transactional"
              required
            />
          </Field>

          <Checkbox
            label="Make this the default pool"
            hint="Organisations with no matching IP pool rule send from the default pool."
            checked={defaultPool}
            onChange={(e) => setDefaultPool(e.target.checked)}
          />

          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={loading}>
              Create pool
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}

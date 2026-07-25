'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { createServer, getIpPools } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';

export default function NewServerPage() {
  const { permalink } = useParams<{ permalink: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'Live' | 'Development'>('Live');
  const [ipPoolId, setIpPoolId] = useState('');
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPools() {
      try {
        const data = await getIpPools();
        setPools(data.ip_pools ?? []);
      } catch {}
    }
    loadPools();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: any = { name, mode };
      if (ipPoolId) payload.ip_pool_id = Number(ipPoolId);
      await createServer(permalink, payload);
      router.push(`/organizations/${permalink}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OrgLayout orgPermalink={permalink}>
      <div className="animate-fade-in max-w-2xl space-y-6">
        {/* Back link */}
        <Link
          href={`/organizations/${permalink}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          &larr; Back to Organization
        </Link>

        {/* Wizard banner */}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <p className="text-sm flex-1">
                The <strong>Setup Wizard</strong> can create a server, domain, and credentials in one guided flow.
              </p>
              <Link
                href={`/organizations/setup?org=${permalink}`}
                className="text-sm font-medium text-primary hover:underline whitespace-nowrap"
              >
                Open Wizard &rarr;
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>New Server</CardTitle>
            <CardDescription>Add a mail server to this organization.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1.5">Name</label>
                <input
                  className="input w-full"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Server"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Mode</label>
                <select className="input w-full" value={mode} onChange={(e) => setMode(e.target.value as any)}>
                  <option value="Live">Live</option>
                  <option value="Development">Development</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Use Development mode for testing — messages are not actually sent.
                </p>
              </div>
              {pools.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">IP Pool</label>
                  <select className="input w-full" value={ipPoolId} onChange={(e) => setIpPoolId(e.target.value)}>
                    <option value="">Default / None</option>
                    {pools.map((pool: any) => (
                      <option key={pool.id} value={pool.id}>{pool.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={loading || !name.trim()}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? 'Creating...' : 'Create Server'}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </OrgLayout>
  );
}

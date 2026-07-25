'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import OrgLayout from '@/components/org-layout';
import { createOrganization } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function NewOrgPage() {
  const [name, setName] = useState('');
  const [permalink, setPermalink] = useState('');
  const [autoSlug, setAutoSlug] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await createOrganization({ name, permalink });
      router.push(`/organizations/${data.organization.permalink}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OrgLayout>
      <div className="animate-fade-in max-w-2xl space-y-6">
        {/* Wizard banner */}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <p className="text-sm flex-1">
                Looking for a guided setup? The <strong>Setup Wizard</strong> walks you through everything step by step.
              </p>
              <Link href="/organizations/setup" className="text-sm font-medium text-primary hover:underline whitespace-nowrap">
                Open Wizard &rarr;
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>New Organization</CardTitle>
            <CardDescription>Enter a name and permalink for your organization.</CardDescription>
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
                  onChange={(e) => {
                    setName(e.target.value);
                    if (autoSlug) setPermalink(slugify(e.target.value));
                  }}
                  placeholder="My Organization"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Permalink</label>
                <input
                  className="input w-full font-mono text-sm"
                  value={permalink}
                  onChange={(e) => {
                    setAutoSlug(false);
                    setPermalink(slugify(e.target.value));
                  }}
                  placeholder="my-org"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used in URLs and API routes.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={loading || !name.trim() || !permalink.trim()}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? 'Creating...' : 'Create Organization'}
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

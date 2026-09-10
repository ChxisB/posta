'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { createOrganization } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { BackLink } from '@/components/ui/back-link';
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/card';
import { Button, ButtonLink } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Field } from '@/components/ui/field';
import { Input, CodeInput } from '@/components/ui/input';

export const dynamic = 'force-dynamic';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function NewOrgPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [permalink, setPermalink] = useState('');
  // Stops mirroring the name the moment the operator edits the permalink by
  // hand, so their choice is not overwritten by the next keystroke in Name.
  const [autoSlug, setAutoSlug] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await createOrganization({ name, permalink });
      router.push(`/organizations/${data.organization.permalink}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumb={<BackLink href="/organizations">Organizations</BackLink>}
        title="New organization"
        description="An organisation owns servers, domains and credentials. Most setups need one per product or per customer."
      />

      <div className="flex max-w-2xl flex-col gap-5">
        <Callout
          tone="info"
          action={
            <ButtonLink href="/organizations/setup" variant="secondary" size="sm">
              Open wizard
            </ButtonLink>
          }
        >
          <span className="flex items-center gap-2">
            <Sparkles size={14} aria-hidden className="shrink-0" />
            The setup wizard creates the organisation and then walks through the server, domain, DNS
            and credential steps in one pass.
          </span>
        </Callout>

        <Card>
          <CardHeader
            title="Details"
            description="Both can be changed later, though the permalink appears in API routes."
          />
          <form onSubmit={handleSubmit}>
            <CardBody className="flex flex-col gap-5">
              {error && <Callout tone="danger">{error}</Callout>}

              <Field label="Name" required>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (autoSlug) setPermalink(slugify(e.target.value));
                  }}
                  placeholder="Acme Mail"
                  required
                />
              </Field>

              <Field
                label="Permalink"
                required
                hint={
                  permalink
                    ? `This organisation will live at /organizations/${permalink}`
                    : 'Used in URLs and API routes. Lowercase letters, numbers and hyphens.'
                }
              >
                <CodeInput
                  value={permalink}
                  onChange={(e) => {
                    setAutoSlug(false);
                    setPermalink(slugify(e.target.value));
                  }}
                  placeholder="acme-mail"
                  required
                />
              </Field>
            </CardBody>
            <CardFooter>
              <Button
                type="submit"
                variant="primary"
                loading={loading}
                disabled={!name.trim() || !permalink.trim()}
              >
                Create organization
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

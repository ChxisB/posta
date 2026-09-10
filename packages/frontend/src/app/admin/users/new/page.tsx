'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUser } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { BackLink } from '@/components/ui/back-link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/select';

export default function NewUserPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [admin, setAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createUser({
        first_name: firstName,
        last_name: lastName,
        email_address: email,
        admin,
      });
      router.push('/admin/users');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumb={<BackLink href="/admin/users">Users</BackLink>}
        title="New user"
        description="The address you enter here is what they sign in with."
      />
      <Card className="max-w-xl" padded>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* A Callout, not the `tag tag-red` pill this used to be: API
              validation messages are sentences, and a pill truncated them. */}
          {error && <Callout tone="danger">{error}</Callout>}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="First name">
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jane"
              />
            </Field>
            <Field label="Last name">
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
              />
            </Field>
          </div>

          <Field label="Email address" required>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              required
            />
          </Field>

          <Checkbox
            label="Administrator"
            hint="Admins can manage every organisation, IP pool and user on this installation."
            checked={admin}
            onChange={(e) => setAdmin(e.target.checked)}
          />

          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={loading}>
              Create user
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

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getUser, updateUser, deleteUser } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { BackLink } from '@/components/ui/back-link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/select';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/providers/toast-provider';

export default function UserEditPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [admin, setAdmin] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!params) return;
    (async () => {
      try {
        const u = (await getUser(params.userId)).user ?? {};
        setFirstName(u.first_name ?? '');
        setLastName(u.last_name ?? '');
        setEmail(u.email_address ?? '');
        setAdmin(!!u.admin);
      } catch (err) {
        // Previously `catch {}`, which left every field blank and presented
        // a failed load as an existing user with no name or address.
        setLoadError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateUser(params.userId, {
        first_name: firstName,
        last_name: lastName,
        email_address: email,
        admin,
      });
      toast('success', 'User updated.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not save the user.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteUser(params.userId);
      router.push('/admin/users');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the user.');
      setDeleting(false);
    }
  };

  const heading = (
    <PageHeader
      breadcrumb={<BackLink href="/admin/users">Users</BackLink>}
      title={email || 'Edit user'}
      description="Changing the email address changes the address this person signs in with."
    />
  );

  if (loading) {
    return (
      <>
        {heading}
        <Card className="max-w-xl" padded>
          <SkeletonRows count={4} height="h-11" />
        </Card>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        {heading}
        <Card>
          <ErrorState
            error={loadError}
            what="this user"
            retryHref={`/admin/users/${params.userId}`}
          />
        </Card>
      </>
    );
  }

  return (
    <>
      {heading}
      <Card className="max-w-xl" padded>
        <form onSubmit={handleSave} className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="First name">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Last name">
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </div>

          <Field label="Email address" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>

          <Checkbox
            label="Administrator"
            hint="Admins can manage every organisation, IP pool and user on this installation."
            checked={admin}
            onChange={(e) => setAdmin(e.target.checked)}
          />

          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={saving}>
              Save changes
            </Button>
            <Button type="button" variant="danger" onClick={() => setConfirmingDelete(true)}>
              Delete user
            </Button>
          </div>
        </form>
      </Card>

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete user"
          description={
            <>
              This permanently removes{' '}
              <strong className="text-foreground">{email || 'this user'}</strong> and revokes their
              access to every organisation. It cannot be undone.
            </>
          }
          confirmLabel="Delete user"
          destructive
          loading={deleting}
          error={deleteError}
          onConfirm={handleDelete}
          onClose={() => {
            setConfirmingDelete(false);
            setDeleteError(null);
          }}
        />
      )}
    </>
  );
}

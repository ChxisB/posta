import { Users as UsersIcon } from 'lucide-react';
import { getUsers } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { FlagPill } from '@/components/ui/pill';

export const dynamic = 'force-dynamic';

interface User {
  id: number;
  first_name?: string;
  last_name?: string;
  email_address?: string;
  admin?: boolean;
  created_at?: string;
}

const COLUMNS: Column<User>[] = [
  {
    key: 'name',
    header: 'Name',
    primary: true,
    cell: (u) => [u.first_name, u.last_name].filter(Boolean).join(' ') || '—',
  },
  {
    key: 'email',
    header: 'Email',
    cell: (u) => <span className="text-muted">{u.email_address}</span>,
  },
  {
    key: 'admin',
    header: 'Role',
    cell: (u) => <FlagPill on={!!u.admin} onLabel="Admin" offLabel="User" />,
  },
  {
    key: 'created',
    header: 'Created',
    cell: (u) => <span className="text-muted">{u.created_at ?? '—'}</span>,
  },
];

export default async function UsersPage() {
  let users: User[] = [];
  let error: unknown = null;
  // Keep the thrown value rather than swallowing it: the page previously ran
  // `catch {}` and fell through to "No users yet", so an API that was down
  // looked exactly like a platform with no accounts on it.
  try {
    users = (await getUsers()).users;
  } catch (err) {
    error = err;
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone with access to this Posta installation. Admins can manage organisations, IP pools and other users."
        actions={
          <ButtonLink href="/admin/users/new" variant="primary">
            New user
          </ButtonLink>
        }
      />
      <Card>
        <div className="px-6 pb-1">
          <DataTable
            rows={users}
            columns={COLUMNS}
            getRowKey={(u) => String(u.id)}
            rowHref={(u) => `/admin/users/${u.id}`}
            getRowLabel={(u) => `Edit ${u.email_address ?? `user ${u.id}`}`}
            error={
              error ? (
                <ErrorState error={error} what="the user list" retryHref="/admin/users" />
              ) : undefined
            }
            empty={
              <EmptyState
                icon={UsersIcon}
                title="No users yet"
                description="Invite the first person to this installation."
                action={
                  <ButtonLink href="/admin/users/new" variant="primary" size="sm">
                    New user
                  </ButtonLink>
                }
              />
            }
          />
        </div>
      </Card>
    </>
  );
}

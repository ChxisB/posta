import OrgLayout from '@/components/org-layout';
import { getUsers } from '@/lib/api';
import Link from 'next/link';
export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  let users: any[] = [];
  try { const d = await getUsers(); users = d.users; } catch {}

  return (
    <OrgLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title gradient-text glow-text">Users</h1>
            <div className="page-subtitle">Manage platform users</div>
          </div>
          <Link href="/admin/users/new" className="btn btn-primary">New User</Link>
        </div>
        <div className="card">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Admin</th><th>Created</th></tr></thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 24 }}>No users yet.</td></tr>
            ) : users.map((u: any) => (
              <tr key={u.id}>
                <td>{u.first_name} {u.last_name}</td>
                <td style={{ color: 'var(--color-text-muted)' }}>{u.email_address}</td>
                <td>{u.admin ? <span className="tag tag-green">Admin</span> : <span className="tag tag-gray">User</span>}</td>
                <td style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{u.created_at ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </OrgLayout>
  );
}

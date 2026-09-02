import Link from 'next/link';
import { notFound } from 'next/navigation';
import { UserInviteForm } from '@/components/access-control/user-invite-form';
import { listUsers } from '@/lib/access-control/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function requireUserAdministration() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const { data, error } = await supabase.rpc('has_permission', {
    permission_code: 'admin.manage_users',
  });
  if (error || data !== true) notFound();
}

export default async function UserAdministrationPage() {
  await requireUserAdministration();
  const users = await listUsers();

  return (
    <>
      <header className="oc-page-head">
        <div>
          <h1>User Administration</h1>
          <p>Manage application identities, account status and controlled access assignments without bypassing the audited RBAC boundary.</p>
        </div>
        <Link className="oc-action-link" href="/dashboard/users/roles">Roles &amp; Permissions</Link>
      </header>

      <section className="oc-card">
        <h2>Invite user</h2>
        <p className="oc-muted">Invitations are sent through the protected server-only Auth administration adapter after admin.manage_users authorization.</p>
        <UserInviteForm />
      </section>

      <section className="oc-card" style={{ marginTop: 18 }}>
        <div className="oc-table-scroll">
          <table className="oc-admin-table">
            <thead>
              <tr>
                <th>Display name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Roles</th>
                <th>Compartments</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><Link className="oc-table-link" href={`/dashboard/users/${user.id}`}>{user.displayName || 'Unnamed user'}</Link></td>
                  <td>{user.email ?? '—'}</td>
                  <td>{user.isActive ? 'Active' : 'Suspended'}</td>
                  <td>{user.roleCount}</td>
                  <td>{user.compartmentCount}</td>
                  <td><Link className="oc-action-link" href={`/dashboard/users/${user.id}/access`}>Manage access</Link></td>
                </tr>
              ))}
              {users.length === 0 ? <tr><td colSpan={6} className="oc-muted">No users are visible to this administrator.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

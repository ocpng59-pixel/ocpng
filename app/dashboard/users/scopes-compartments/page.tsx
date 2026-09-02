import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listUsers } from '@/lib/access-control/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function requireCompartmentAdministration() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const [usersCheck, rolesCheck] = await Promise.all([
    supabase.rpc('has_permission', { permission_code: 'admin.manage_users' }),
    supabase.rpc('has_permission', { permission_code: 'admin.manage_roles' }),
  ]);
  if (usersCheck.error || usersCheck.data !== true || rolesCheck.error || rolesCheck.data !== true) notFound();
}

export default async function ScopesCompartmentsPage() {
  await requireCompartmentAdministration();
  const users = await listUsers();

  return (
    <>
      <header className="oc-page-head">
        <div>
          <h1>Grant compartment</h1>
          <p>Select a target user to manage roles, organisational/data scopes and need-to-know security compartments.</p>
        </div>
        <Link className="oc-action-link" href="/dashboard/users/roles">Review roles</Link>
      </header>

      <section className="oc-card">
        <div className="oc-table-scroll">
          <table className="oc-admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Status</th>
                <th>Roles</th>
                <th>Compartments</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.displayName || 'Unnamed user'}</td>
                  <td>{user.email ?? '—'}</td>
                  <td>{user.isActive ? 'Active' : 'Suspended'}</td>
                  <td>{user.roleCount}</td>
                  <td>{user.compartmentCount}</td>
                  <td>
                    <Link className="oc-action-link" href={`/dashboard/users/${user.id}/access`}>
                      Manage roles, scopes & compartments
                    </Link>
                  </td>
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

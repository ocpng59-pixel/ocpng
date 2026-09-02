import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listRoles } from '@/lib/access-control/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function requireRoleAdministration() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const { data, error } = await supabase.rpc('has_permission', {
    permission_code: 'admin.manage_roles',
  });
  if (error || data !== true) notFound();
}

function status(role: { isRetired: boolean; isActive: boolean }) {
  if (role.isRetired) return 'Retired';
  return role.isActive ? 'Active' : 'Inactive';
}

export default async function RolesAdministrationPage() {
  await requireRoleAdministration();
  const roles = await listRoles();

  return (
    <>
      <header className="oc-page-head">
        <div>
          <h1>Roles, Permissions & Compartments</h1>
          <p>Configure application roles and approved permission assignments through the audited Access Control administration boundary.</p>
        </div>
        <Link className="oc-button" href="/dashboard/users/roles/new">Create role</Link>
      </header>

      <nav className="oc-actions" aria-label="Access Control administration">
        <Link className="oc-action-link active" href="/dashboard/users/roles">Review roles</Link>
        <Link className="oc-action-link" href="/dashboard/users/permissions">Permissions</Link>
        <Link className="oc-action-link" href="/dashboard/users/scopes-compartments">Grant compartment</Link>
        <Link className="oc-action-link" href="/dashboard/audit-log">Audit History</Link>
      </nav>

      <section className="oc-card">
        <div className="oc-table-scroll">
          <table className="oc-admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Users</th>
                <th>Permissions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td><Link className="oc-table-link" href={`/dashboard/users/roles/${role.id}`}><code>{role.code}</code></Link></td>
                  <td>{role.name}</td>
                  <td>{role.roleType}</td>
                  <td>{status(role)}</td>
                  <td>{role.userCount}</td>
                  <td>{role.permissionCount}</td>
                </tr>
              ))}
              {roles.length === 0 ? (
                <tr><td colSpan={6} className="oc-muted">No roles are visible to this administrator.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

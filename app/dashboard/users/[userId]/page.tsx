import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUserAccess } from '@/lib/access-control/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function requireUserAdministration() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const { data, error } = await supabase.rpc('has_permission', {
    permission_code: 'admin.manage_users',
  });
  if (error || data !== true) notFound();
}

export default async function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireUserAdministration();
  const { userId } = await params;
  const access = await getUserAccess(userId);
  if (!access) notFound();

  return (
    <>
      <header className="oc-page-head">
        <div>
          <h1>{access.user.displayName || 'WASDOK User'}</h1>
          <p>{access.user.email ?? 'No email recorded'} · {access.user.isActive ? 'Active' : 'Suspended'}</p>
        </div>
        <Link className="oc-button" href={`/dashboard/users/${userId}/access`}>Manage access</Link>
      </header>

      <div className="oc-admin-grid">
        <section className="oc-card">
          <h2>Roles</h2>
          <ul className="oc-list">
            {access.roles.map((role) => <li key={role.assignmentId}>{role.name} ({role.code}) — {role.isActive ? 'Active' : 'Revoked'}</li>)}
            {access.roles.length === 0 ? <li>No role assignments.</li> : null}
          </ul>
        </section>

        <section className="oc-card">
          <h2>Effective permissions</h2>
          <ul className="oc-list">
            {access.effectivePermissions.map((permission) => <li key={permission}><code>{permission}</code></li>)}
            {access.effectivePermissions.length === 0 ? <li>No effective permissions.</li> : null}
          </ul>
        </section>

        <section className="oc-card">
          <h2>Data scopes</h2>
          <ul className="oc-list">
            {access.scopes.map((scope) => <li key={scope.assignmentId}>{scope.scopeCode} ({scope.scopeType}) — {scope.isActive ? 'Active' : 'Revoked'}</li>)}
            {access.scopes.length === 0 ? <li>No data scopes.</li> : null}
          </ul>
        </section>

        <section className="oc-card">
          <h2>Security compartments</h2>
          <ul className="oc-list">
            {access.compartments.map((item) => <li key={item.assignmentId}>{item.name} ({item.code}) — {item.isActive ? 'Active' : 'Revoked'}</li>)}
            {access.compartments.length === 0 ? <li>No restricted compartments.</li> : null}
          </ul>
        </section>
      </div>

      <div className="oc-inline-actions" style={{ marginTop: 18 }}>
        <Link className="oc-action-link" href="/dashboard/users">Back to users</Link>
        <Link className="oc-action-link" href="/dashboard/users/scopes-compartments">Scopes &amp; Compartments</Link>
      </div>
    </>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listPermissions } from '@/lib/access-control/queries';
import type { PermissionSummary } from '@/lib/access-control/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function requireRoleAdministration() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const { data, error } = await supabase.rpc('has_permission', {
    permission_code: 'admin.manage_roles',
  });
  if (error || data !== true) notFound();
}

export default async function PermissionCataloguePage() {
  await requireRoleAdministration();
  const permissions = await listPermissions();
  const grouped = permissions.reduce<Record<string, PermissionSummary[]>>((result, permission) => {
    (result[permission.domain] ??= []).push(permission);
    return result;
  }, {});

  return (
    <>
      <header className="oc-page-head">
        <div>
          <h1>Permission Catalogue</h1>
          <p>Read-only catalogue of application capabilities implemented by WASDOK 360. Administrators assign these approved capabilities to roles; arbitrary permission identifiers cannot be created here.</p>
        </div>
        <Link className="oc-action-link" href="/dashboard/users/roles">Back to roles</Link>
      </header>

      <div className="oc-admin-grid">
        {Object.entries(grouped).map(([domain, domainPermissions]) => (
          <section className="oc-card" key={domain}>
            <h2>{domain}</h2>
            <div className="oc-table-scroll">
              <table className="oc-admin-table">
                <thead><tr><th>Code</th><th>Name</th><th>Classification</th></tr></thead>
                <tbody>
                  {domainPermissions.map((permission) => (
                    <tr key={permission.id}>
                      <td><code>{permission.code}</code></td>
                      <td>{permission.name}</td>
                      <td>{permission.classification}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

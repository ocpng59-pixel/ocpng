import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  grantRolePermissionAction,
  retireRoleAction,
  revokeRolePermissionAction,
  setRoleActiveAction,
  updateRoleAction,
} from '@/app/dashboard/users/roles/actions';
import { PermissionMatrix } from '@/components/access-control/permission-matrix';
import { RoleForm, RoleLifecycleControls } from '@/components/access-control/role-form';
import { getRoleDetail, listPermissions } from '@/lib/access-control/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function requireRoleAdministration() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const { data, error } = await supabase.rpc('has_permission', {
    permission_code: 'admin.manage_roles',
  });
  if (error || data !== true) notFound();
}

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  await requireRoleAdministration();
  const { roleId } = await params;
  const [role, permissions] = await Promise.all([
    getRoleDetail(roleId),
    listPermissions(),
  ]);
  if (!role) notFound();

  const mutationsDisabled = role.actorHoldsRole || role.isRetired;
  const grantedCodes = role.permissions.map((permission) => permission.code);

  return (
    <>
      <header className="oc-page-head">
        <div>
          <h1>{role.name}</h1>
          <p><code>{role.code}</code> · {role.roleType} · {role.isRetired ? 'Retired' : role.isActive ? 'Active' : 'Inactive'}</p>
        </div>
        <Link className="oc-action-link" href="/dashboard/users/roles">Back to roles</Link>
      </header>

      {role.actorHoldsRole ? (
        <div className="oc-notice oc-protected-notice">
          You cannot change a role currently assigned to your own account.
        </div>
      ) : null}
      {role.isRetired ? (
        <div className="oc-notice">This role is retired. Historical identity and audit evidence are retained, and mutation controls are disabled.</div>
      ) : null}

      <section>
        <h2>Role configuration</h2>
        <RoleForm action={updateRoleAction} role={role} disabled={mutationsDisabled} />
      </section>

      <section className="oc-admin-section">
        <h2>Role lifecycle</h2>
        <RoleLifecycleControls
          roleId={role.id}
          isActive={role.isActive}
          disabled={mutationsDisabled}
          setActiveAction={setRoleActiveAction}
          retireAction={retireRoleAction}
        />
      </section>

      <section className="oc-admin-section">
        <h2>Permission Matrix</h2>
        <p className="oc-muted">Grant or revoke only approved WASDOK 360 application capabilities. Every change requires an administrative reason and is audited.</p>
        <PermissionMatrix
          roleId={role.id}
          permissions={permissions}
          grantedCodes={grantedCodes}
          disabled={mutationsDisabled}
          grantAction={grantRolePermissionAction}
          revokeAction={revokeRolePermissionAction}
        />
      </section>
    </>
  );
}

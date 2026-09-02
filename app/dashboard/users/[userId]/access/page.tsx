import Link from 'next/link';
import { notFound } from 'next/navigation';
import { UserAccessForm } from '@/components/access-control/user-access-form';
import { getUserAccess, listCompartments, listRoles } from '@/lib/access-control/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function accessAdministrationCapabilities(): Promise<{ canManageRoles: boolean }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();

  const [usersCheck, rolesCheck] = await Promise.all([
    supabase.rpc('has_permission', { permission_code: 'admin.manage_users' }),
    supabase.rpc('has_permission', { permission_code: 'admin.manage_roles' }),
  ]);
  if (usersCheck.error || usersCheck.data !== true) notFound();
  return { canManageRoles: !rolesCheck.error && rolesCheck.data === true };
}

export default async function UserAccessPage({ params }: { params: Promise<{ userId: string }> }) {
  const { canManageRoles } = await accessAdministrationCapabilities();
  const { userId } = await params;
  const [access, roles, compartments] = await Promise.all([
    getUserAccess(userId),
    listRoles(),
    listCompartments(),
  ]);
  if (!access) notFound();

  return (
    <>
      <header className="oc-page-head">
        <div>
          <h1>Access assignments — {access.user.displayName || 'WASDOK User'}</h1>
          <p>Manage current roles, data scopes, security compartments and account status through audited administration operations.</p>
        </div>
        <Link className="oc-action-link" href={`/dashboard/users/${userId}`}>View user</Link>
      </header>

      {access.isSelf ? (
        <div className="oc-notice oc-protected-notice">
          <strong>You cannot modify your own privileged access.</strong>
          <p>Your current access is shown on the user detail page. Database safeguards also reject self-modification if browser markup is manipulated.</p>
        </div>
      ) : (
        <UserAccessForm
          access={access}
          availableRoles={roles}
          compartments={compartments}
          canManageRoles={canManageRoles}
        />
      )}

      <div className="oc-inline-actions" style={{ marginTop: 18 }}>
        <Link className="oc-action-link" href="/dashboard/users">Users</Link>
        <Link className="oc-action-link" href="/dashboard/users/scopes-compartments">Scopes &amp; Compartments</Link>
      </div>
    </>
  );
}

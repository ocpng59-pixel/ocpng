import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RoleForm } from '@/components/access-control/role-form';
import { createRoleAction } from '@/app/dashboard/users/roles/actions';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function requireRoleAdministration() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const { data, error } = await supabase.rpc('has_permission', {
    permission_code: 'admin.manage_roles',
  });
  if (error || data !== true) notFound();
}

export default async function NewRolePage() {
  await requireRoleAdministration();
  return (
    <>
      <header className="oc-page-head">
        <div>
          <h1>Create role</h1>
          <p>Create a configurable WASDOK 360 application role. Permission assignment is managed after the role is created.</p>
        </div>
        <Link className="oc-action-link" href="/dashboard/users/roles">Back to roles</Link>
      </header>
      <RoleForm action={createRoleAction} />
    </>
  );
}

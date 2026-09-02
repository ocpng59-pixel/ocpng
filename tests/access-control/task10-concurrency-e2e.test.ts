import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const describeE2E = process.env.WASDOK78_ACCESS_E2E === 'true'
  ? describe.sequential
  : describe.skip;

const password = 'DEMO-WASDOK78-Task10-Local-Only!';
const suffix = randomUUID().replaceAll('-', '').slice(0, 10);

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing local Supabase environment: ${name}`);
  return value;
}

function client(key: string): SupabaseClient {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function makeUser(service: SupabaseClient, label: string) {
  const email = `wasdok78-task10-${label}-${suffix}@example.invalid`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `DEMO WASDOK78 Task10 ${label}` },
  });
  expect(error).toBeNull();
  const session = client(env('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  const { error: signInError } = await session.auth.signInWithPassword({ email, password });
  expect(signInError).toBeNull();
  return { id: data.user!.id, client: session };
}

describeE2E('WASDOK-78 Task 10 last-admin concurrency', () => {
  let service: SupabaseClient;
  let userAdmin: Awaited<ReturnType<typeof makeUser>>;
  let roleAdminA: Awaited<ReturnType<typeof makeUser>>;
  let roleAdminB: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    service = client(env('SUPABASE_SERVICE_ROLE_KEY'));
    userAdmin = await makeUser(service, 'user-admin');
    roleAdminA = await makeUser(service, 'role-admin-a');
    roleAdminB = await makeUser(service, 'role-admin-b');

    const roleIds = {
      userAdmin: randomUUID(),
      roleAdmin: randomUUID(),
    };
    const { error: rolesError } = await service.from('roles').insert([
      {
        id: roleIds.userAdmin,
        code: `wasdok78_task10_user_admin_${suffix}`,
        name: 'DEMO WASDOK78 Task10 User Admin',
        is_system: false,
        is_active: true,
        role_type: 'administrative',
      },
      {
        id: roleIds.roleAdmin,
        code: `wasdok78_task10_role_admin_${suffix}`,
        name: 'DEMO WASDOK78 Task10 Role Admin',
        is_system: false,
        is_active: true,
        role_type: 'administrative',
      },
    ]);
    expect(rolesError).toBeNull();

    const { data: permissions, error: permissionError } = await service
      .from('permissions')
      .select('id,code')
      .in('code', ['admin.manage_users', 'admin.manage_roles']);
    expect(permissionError).toBeNull();
    const byCode = new Map(permissions!.map((row) => [row.code, row.id]));

    const { error: rolePermissionsError } = await service.from('role_permissions').insert([
      {
        role_id: roleIds.userAdmin,
        permission_id: byCode.get('admin.manage_users'),
        is_active: true,
      },
      {
        role_id: roleIds.roleAdmin,
        permission_id: byCode.get('admin.manage_roles'),
        is_active: true,
      },
    ]);
    expect(rolePermissionsError).toBeNull();

    const { error: assignmentsError } = await service.from('user_roles').insert([
      { user_id: userAdmin.id, role_id: roleIds.userAdmin, is_active: true },
      { user_id: roleAdminA.id, role_id: roleIds.roleAdmin, is_active: true },
      { user_id: roleAdminB.id, role_id: roleIds.roleAdmin, is_active: true },
    ]);
    expect(assignmentsError).toBeNull();
  });

  it('does not allow two concurrent suspensions to remove both final role administrators', async () => {
    const attempts = await Promise.all([
      userAdmin.client.rpc('admin_set_user_active', {
        p_user_id: roleAdminA.id,
        p_is_active: false,
        p_reason: 'Task 10 concurrent final role-admin suspension A',
      }),
      userAdmin.client.rpc('admin_set_user_active', {
        p_user_id: roleAdminB.id,
        p_is_active: false,
        p_reason: 'Task 10 concurrent final role-admin suspension B',
      }),
    ]);

    expect(attempts.filter(({ error }) => error === null)).toHaveLength(1);
    expect(attempts.filter(({ error }) => error?.code === '23514')).toHaveLength(1);

    const { data: profiles, error: profileError } = await service
      .from('profiles')
      .select('id,is_active')
      .in('id', [roleAdminA.id, roleAdminB.id]);
    expect(profileError).toBeNull();
    expect(profiles?.filter((profile) => profile.is_active)).toHaveLength(1);
  });
});

import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const describeE2E = process.env.WASDOK78_ACCESS_E2E === 'true'
  ? describe.sequential
  : describe.skip;

const demoPassword = 'DEMO-WASDOK78-Local-Only!';
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`WASDOK-78 local Supabase environment is unavailable: ${name}.`);
  return value;
}

function serviceClient(): SupabaseClient {
  return createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

function anonymousClient(): SupabaseClient {
  return createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

async function exactCount(client: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  expect(error).toBeNull();
  expect(count).not.toBeNull();
  return count!;
}

async function createAuthenticatedDemoUser(
  service: SupabaseClient,
  label: string,
): Promise<{ id: string; email: string; client: SupabaseClient }> {
  const email = `wasdok78-${label}-${suffix}@test.invalid`;
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { display_name: `DEMO WASDOK78 ${label}` },
  });
  expect(createError).toBeNull();
  expect(created.user?.id).toBeTruthy();

  const client = anonymousClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: demoPassword });
  expect(signInError).toBeNull();

  return { id: created.user!.id, email, client };
}

async function permissionFor(client: SupabaseClient, permissionCode: string): Promise<boolean> {
  const { data, error } = await client.rpc('has_permission', { permission_code: permissionCode });
  expect(error).toBeNull();
  return data === true;
}

async function compartmentFor(client: SupabaseClient, compartment: string): Promise<boolean> {
  const { data, error } = await client.rpc('has_compartment', { classification_code: compartment });
  expect(error).toBeNull();
  return data === true;
}

async function scopeFor(client: SupabaseClient, scopeCode: string): Promise<boolean> {
  const { data, error } = await client.rpc('has_scope', { scope_code: scopeCode });
  expect(error).toBeNull();
  return data === true;
}

describeE2E('WASDOK-78 Access Control end-to-end', () => {
  let service: SupabaseClient;
  let admin: { id: string; email: string; client: SupabaseClient };
  let backup: { id: string; email: string; client: SupabaseClient };
  let target: { id: string; email: string; client: SupabaseClient };
  let nonAdmin: { id: string; email: string; client: SupabaseClient };
  let systemAdministratorRoleId: string;

  beforeAll(async () => {
    service = serviceClient();
    admin = await createAuthenticatedDemoUser(service, 'Admin');
    backup = await createAuthenticatedDemoUser(service, 'Backup Admin');
    target = await createAuthenticatedDemoUser(service, 'Target User');
    nonAdmin = await createAuthenticatedDemoUser(service, 'Non Admin');

    const { data: role, error: roleError } = await service
      .from('roles')
      .select('id')
      .eq('code', 'system_administrator')
      .single();
    expect(roleError).toBeNull();
    systemAdministratorRoleId = role!.id;

    const adminPermissionCodes = ['admin.manage_roles', 'admin.manage_users', 'dashboard.view'];
    const { data: permissionRows, error: permissionError } = await service
      .from('permissions')
      .select('id,code')
      .in('code', adminPermissionCodes);
    expect(permissionError).toBeNull();
    expect(permissionRows).toHaveLength(adminPermissionCodes.length);

    const { error: rolePermissionError } = await service.from('role_permissions').upsert(
      permissionRows!.map((permission) => ({
        role_id: systemAdministratorRoleId,
        permission_id: permission.id,
        is_active: true,
        revoked_at: null,
        revoked_by: null,
        metadata: { demo: true, wasdok: 'WASDOK-78' },
      })),
      { onConflict: 'role_id,permission_id' },
    );
    expect(rolePermissionError).toBeNull();

    const { error: userRoleError } = await service.from('user_roles').upsert([
      {
        user_id: admin.id,
        role_id: systemAdministratorRoleId,
        is_active: true,
        metadata: { demo: true, wasdok: 'WASDOK-78' },
      },
      {
        user_id: backup.id,
        role_id: systemAdministratorRoleId,
        is_active: true,
        metadata: { demo: true, wasdok: 'WASDOK-78' },
      },
    ], { onConflict: 'user_id,role_id' });
    expect(userRoleError).toBeNull();

    expect(await permissionFor(admin.client, 'admin.manage_roles')).toBe(true);
    expect(await permissionFor(admin.client, 'admin.manage_users')).toBe(true);
    expect(await permissionFor(backup.client, 'admin.manage_roles')).toBe(true);
    expect(await permissionFor(nonAdmin.client, 'admin.manage_users')).toBe(false);
  });

  it('seeds only the configurable Training Super Administrator definition for UAT', async () => {
    const { data: role, error } = await service
      .from('roles')
      .select('id,code,name,is_system,is_active,role_type,metadata')
      .eq('code', 'training_super_admin')
      .single();

    expect(error).toBeNull();
    expect(role).toMatchObject({
      code: 'training_super_admin',
      name: 'Training Super Administrator',
      is_system: false,
      is_active: true,
      role_type: 'training',
    });
    expect(role?.metadata?.demo_role).toBe(true);

    const { count: assignedUsers, error: userRoleError } = await service
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('role_id', role!.id)
      .eq('is_active', true);
    expect(userRoleError).toBeNull();
    expect(assignedUsers).toBe(0);

    const { count: grantedPermissions, error: rolePermissionError } = await service
      .from('role_permissions')
      .select('id', { count: 'exact', head: true })
      .eq('role_id', role!.id)
      .eq('is_active', true);
    expect(rolePermissionError).toBeNull();
    expect(grantedPermissions).toBe(0);
  });

  it('applies role, permission, scope, compartment and suspension changes immediately with safe audit evidence', async () => {
    const roleCode = `wasdok78_demo_operator_${suffix}`;
    const { data: roleId, error: createRoleError } = await admin.client.rpc('admin_create_role', {
      p_code: roleCode,
      p_name: 'DEMO WASDOK78 Operator',
      p_description: 'DEMO/UAT role created by the local WASDOK-78 end-to-end test.',
      p_role_type: 'operational',
      p_reason: 'Task 9 local E2E role creation',
    });
    expect(createRoleError).toBeNull();
    expect(roleId).toMatch(/^[0-9a-f-]{36}$/i);

    for (const permissionCode of ['complaints.view', 'dashboard.view']) {
      const { error } = await admin.client.rpc('admin_grant_role_permission', {
        p_role_id: roleId,
        p_permission_code: permissionCode,
        p_reason: `Task 9 local E2E grant ${permissionCode}`,
      });
      expect(error).toBeNull();
    }

    const { error: assignError } = await admin.client.rpc('admin_assign_user_role', {
      p_user_id: target.id,
      p_role_id: roleId,
      p_reason: 'Task 9 local E2E target role assignment',
    });
    expect(assignError).toBeNull();

    const { error: scopeError } = await admin.client.rpc('admin_grant_data_scope', {
      p_user_id: target.id,
      p_scope_code: 'DEMO_WASDOK78_SCOPE',
      p_scope_type: 'UAT',
      p_reason: 'Task 9 local E2E data scope grant',
    });
    expect(scopeError).toBeNull();

    const { error: compartmentError } = await admin.client.rpc('admin_grant_user_compartment', {
      p_user_id: target.id,
      p_compartment_code: 'CONFIDENTIAL',
      p_reason: 'Task 9 local E2E compartment grant',
    });
    expect(compartmentError).toBeNull();

    expect(await permissionFor(target.client, 'complaints.view')).toBe(true);
    expect(await permissionFor(target.client, 'dashboard.view')).toBe(true);
    expect(await scopeFor(target.client, 'DEMO_WASDOK78_SCOPE')).toBe(true);
    expect(await compartmentFor(target.client, 'CONFIDENTIAL')).toBe(true);

    const { error: revokePermissionError } = await admin.client.rpc('admin_revoke_role_permission', {
      p_role_id: roleId,
      p_permission_code: 'complaints.view',
      p_reason: 'Task 9 local E2E permission revoke',
    });
    expect(revokePermissionError).toBeNull();
    expect(await permissionFor(target.client, 'complaints.view')).toBe(false);

    const { error: suspendError } = await admin.client.rpc('admin_set_user_active', {
      p_user_id: target.id,
      p_is_active: false,
      p_reason: 'Task 9 local E2E suspension',
    });
    expect(suspendError).toBeNull();
    expect(await permissionFor(target.client, 'dashboard.view')).toBe(false);
    expect(await scopeFor(target.client, 'DEMO_WASDOK78_SCOPE')).toBe(false);
    expect(await compartmentFor(target.client, 'CONFIDENTIAL')).toBe(false);

    const { data: auditEvents, error: auditError } = await service
      .from('audit_events')
      .select('action,entity_type,entity_id,request_metadata,before_data,after_data,reason,metadata')
      .eq('actor_id', admin.id)
      .order('created_at', { ascending: true });
    expect(auditError).toBeNull();

    const auditActions = auditEvents?.map((event) => event.action) ?? [];
    expect(auditActions).toEqual(expect.arrayContaining([
      'access.role_created',
      'access.role_permission_granted',
      'access.user_role_assigned',
      'access.scope_granted',
      'access.compartment_granted',
      'access.role_permission_revoked',
      'access.user_suspended',
    ]));

    const serializedAudit = JSON.stringify(auditEvents);
    expect(serializedAudit).not.toContain(admin.email);
    expect(serializedAudit).not.toContain(backup.email);
    expect(serializedAudit).not.toContain(target.email);
    expect(serializedAudit).not.toContain(nonAdmin.email);
    expect(serializedAudit).not.toContain('DEMO WASDOK78 Target User');
    expect(serializedAudit).not.toContain(demoPassword);
    expect(serializedAudit.toLowerCase()).not.toMatch(/authorization|refresh_token|access_token|session_cookie|bearer\s|password/);

    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(serializedAudit.includes(serviceRoleKey)).toBe(false);
    expect(serializedAudit.includes(anonKey)).toBe(false);
  });

  it('rejects non-admin mutations and administrator self-escalation without row or audit changes', async () => {
    const rolesBefore = await exactCount(service, 'roles');
    const auditBeforeNonAdmin = await exactCount(service, 'audit_events');

    const { error: nonAdminError } = await nonAdmin.client.rpc('admin_create_role', {
      p_code: `forbidden_${suffix}`,
      p_name: 'Forbidden role',
      p_description: 'Must never be persisted.',
      p_role_type: 'operational',
      p_reason: 'Task 9 negative test',
    });
    expect(nonAdminError?.code).toBe('42501');
    expect(await exactCount(service, 'roles')).toBe(rolesBefore);
    expect(await exactCount(service, 'audit_events')).toBe(auditBeforeNonAdmin);

    const { count: selfAssignmentsBefore, error: selfCountError } = await service
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', admin.id);
    expect(selfCountError).toBeNull();
    const auditBeforeSelf = await exactCount(service, 'audit_events');

    const { error: selfAssignmentError } = await admin.client.rpc('admin_assign_user_role', {
      p_user_id: admin.id,
      p_role_id: systemAdministratorRoleId,
      p_reason: 'Task 9 self-escalation negative test',
    });
    expect(selfAssignmentError?.code).toBe('42501');

    const { error: heldRolePermissionError } = await admin.client.rpc('admin_grant_role_permission', {
      p_role_id: systemAdministratorRoleId,
      p_permission_code: 'audit.view',
      p_reason: 'Task 9 held-role negative test',
    });
    expect(heldRolePermissionError?.code).toBe('42501');

    const { count: selfAssignmentsAfter, error: selfAfterError } = await service
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', admin.id);
    expect(selfAfterError).toBeNull();
    expect(selfAssignmentsAfter).toBe(selfAssignmentsBefore);
    expect(await exactCount(service, 'audit_events')).toBe(auditBeforeSelf);
  });
});

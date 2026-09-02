import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  CompartmentSummary,
  PermissionSummary,
  RoleDetail,
  RoleSummary,
  RoleType,
  SecurityClassification,
  UserAccess,
  UserCompartmentAssignment,
  UserRoleAssignment,
  UserScopeAssignment,
  UserSummary,
} from '@/lib/access-control/types';

type Row = Record<string, unknown>;

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => !!item && typeof item === 'object') : [];
}

function relation(value: unknown): Row | null {
  if (Array.isArray(value)) return relation(value[0]);
  return value && typeof value === 'object' ? value as Row : null;
}

function relationCount(value: unknown): number {
  const first = relation(value);
  return typeof first?.count === 'number' ? first.count : 0;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function roleType(value: unknown): RoleType {
  return value === 'administrative' || value === 'training' ? value : 'operational';
}

function classification(value: unknown): SecurityClassification {
  const candidate = text(value);
  const allowed: SecurityClassification[] = [
    'PUBLIC',
    'INTERNAL',
    'CONFIDENTIAL',
    'RESTRICTED',
    'LEADERSHIP_RESTRICTED',
    'ANNUAL_STATEMENT_SECRET',
    'INTELLIGENCE_SECRET',
    'LEGAL_PRIVILEGE',
  ];
  return allowed.includes(candidate as SecurityClassification)
    ? candidate as SecurityClassification
    : 'INTERNAL';
}

async function actorId(): Promise<{ client: Awaited<ReturnType<typeof createServerSupabaseClient>>; actorId: string | null }> {
  const client = await createServerSupabaseClient();
  if (!client) return { client: null, actorId: null };

  const { data, error } = await client.auth.getClaims();
  if (error) return { client, actorId: null };

  const sub = data?.claims?.sub;
  return { client, actorId: typeof sub === 'string' ? sub : null };
}

function mapRoleSummary(row: Row): RoleSummary {
  return {
    id: text(row.id),
    code: text(row.code),
    name: text(row.name),
    description: nullableText(row.description),
    roleType: roleType(row.role_type),
    isActive: bool(row.is_active),
    isRetired: row.deleted_at != null,
    userCount: relationCount(row.user_roles),
    permissionCount: relationCount(row.role_permissions),
  };
}

function mapUserSummary(row: Row): UserSummary {
  return {
    id: text(row.id),
    displayName: text(row.display_name),
    email: nullableText(row.email),
    isActive: bool(row.is_active),
    classification: classification(row.classification),
    organisationScope: nullableText(row.organisation_scope),
    roleCount: relationCount(row.user_roles),
    compartmentCount: relationCount(row.user_compartments),
  };
}

export async function listRoles(): Promise<RoleSummary[]> {
  const client = await createServerSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('roles')
    .select('id,code,name,description,role_type,is_active,deleted_at,user_roles(count),role_permissions(count)')
    .eq('user_roles.is_active', true)
    .eq('role_permissions.is_active', true)
    .order('name');

  if (error) return [];
  return rows(data).map(mapRoleSummary);
}

export async function getRoleDetail(roleId: string): Promise<RoleDetail | null> {
  const { client, actorId: currentActorId } = await actorId();
  if (!client || !currentActorId) return null;

  const { data, error } = await client
    .from('roles')
    .select('id,code,name,description,role_type,is_active,deleted_at,user_roles(count),role_permissions(is_active,permission:permissions(id,code,name,domain,classification))')
    .eq('id', roleId)
    .eq('user_roles.is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as Row;

  const permissions = rows(row.role_permissions)
    .filter((item) => bool(item.is_active))
    .map((item): PermissionSummary | null => {
      const permission = relation(item.permission);
      if (!permission) return null;
      return {
        id: text(permission.id),
        code: text(permission.code),
        name: text(permission.name),
        domain: text(permission.domain),
        classification: classification(permission.classification),
      };
    })
    .filter((item): item is PermissionSummary => item !== null);

  const { data: held, error: heldError } = await client
    .from('user_roles')
    .select('id')
    .eq('user_id', currentActorId)
    .eq('role_id', roleId)
    .eq('is_active', true)
    .limit(1);

  if (heldError) return null;

  return {
    ...mapRoleSummary({ ...row, role_permissions: [{ count: permissions.length }] }),
    permissions,
    actorHoldsRole: Array.isArray(held) && held.length > 0,
  };
}

export async function listUsers(): Promise<UserSummary[]> {
  const client = await createServerSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('profiles')
    .select('id,display_name,email,is_active,classification,organisation_scope,user_roles(count),user_compartments(count)')
    .eq('user_roles.is_active', true)
    .eq('user_compartments.is_active', true)
    .order('display_name');

  if (error) return [];
  return rows(data).map(mapUserSummary);
}

export async function getUserAccess(userId: string): Promise<UserAccess | null> {
  const { client, actorId: currentActorId } = await actorId();
  if (!client || !currentActorId) return null;

  const { data: profileData, error: profileError } = await client
    .from('profiles')
    .select('id,display_name,email,is_active,classification,organisation_scope,user_roles(count),user_compartments(count)')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profileData) return null;

  const { data: userRoleData, error: userRoleError } = await client
    .from('user_roles')
    .select('id,role_id,is_active,role:roles(id,code,name,role_type,is_active,deleted_at,role_permissions(is_active,permission:permissions(code)))')
    .eq('user_id', userId);

  const { data: scopeData, error: scopeError } = await client
    .from('data_scopes')
    .select('id,scope_code,scope_type,active')
    .eq('user_id', userId);

  const { data: compartmentData, error: compartmentError } = await client
    .from('user_compartments')
    .select('id,compartment_id,is_active,compartment:security_compartments(code,name)')
    .eq('user_id', userId);

  if (userRoleError || scopeError || compartmentError) return null;

  const roleRows = rows(userRoleData);
  const roles: UserRoleAssignment[] = roleRows.map((item) => {
    const role = relation(item.role) ?? {};
    return {
      assignmentId: text(item.id),
      roleId: text(item.role_id),
      code: text(role.code),
      name: text(role.name),
      roleType: roleType(role.role_type),
      isActive: bool(item.is_active),
    };
  });

  const effectivePermissions = [...new Set(roleRows.flatMap((item) => {
    if (!bool(item.is_active)) return [];
    const role = relation(item.role);
    if (!role || !bool(role.is_active) || role.deleted_at != null) return [];
    return rows(role.role_permissions).flatMap((assignment) => {
      if (!bool(assignment.is_active)) return [];
      const permission = relation(assignment.permission);
      const code = permission ? text(permission.code) : '';
      return code ? [code] : [];
    });
  }))].sort();

  const scopes: UserScopeAssignment[] = rows(scopeData).map((item) => ({
    assignmentId: text(item.id),
    scopeCode: text(item.scope_code),
    scopeType: text(item.scope_type),
    isActive: bool(item.active),
  }));

  const compartments: UserCompartmentAssignment[] = rows(compartmentData).map((item) => {
    const compartment = relation(item.compartment) ?? {};
    return {
      assignmentId: text(item.id),
      compartmentId: text(item.compartment_id),
      code: classification(compartment.code),
      name: text(compartment.name),
      isActive: bool(item.is_active),
    };
  });

  return {
    user: mapUserSummary(profileData as unknown as Row),
    roles,
    effectivePermissions,
    scopes,
    compartments,
    isSelf: currentActorId === userId,
  };
}

export async function listPermissions(): Promise<PermissionSummary[]> {
  const client = await createServerSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('permissions')
    .select('id,code,name,domain,classification')
    .order('domain')
    .order('code');

  if (error) return [];
  return rows(data).map((row) => ({
    id: text(row.id),
    code: text(row.code),
    name: text(row.name),
    domain: text(row.domain),
    classification: classification(row.classification),
  }));
}

export async function listCompartments(): Promise<CompartmentSummary[]> {
  const client = await createServerSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('security_compartments')
    .select('id,code,name,description')
    .order('name');

  if (error) return [];
  return rows(data).map((row) => ({
    id: text(row.id),
    code: classification(row.code),
    name: text(row.name),
    description: nullableText(row.description),
  }));
}

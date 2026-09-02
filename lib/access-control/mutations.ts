import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  AccessControlActionState,
  RoleType,
  SecurityClassification,
} from '@/lib/access-control/types';

type RpcArguments = Record<string, string | boolean | null>;

export function mapAccessControlError(code?: string | null): string {
  switch (code) {
    case '42501':
      return 'Administrative permission denied.';
    case '22023':
      return 'The submitted access change is invalid.';
    case '23505':
      return 'That active assignment already exists.';
    case '23514':
      return 'The access change is blocked by a security safeguard.';
    default:
      return 'The access change could not be completed.';
  }
}

async function executeMutation(
  rpcName: string,
  args: RpcArguments,
  successMessage: string,
): Promise<AccessControlActionState> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, message: 'Access Control is unavailable.' };

  const { error } = await supabase.rpc(rpcName, args);
  if (!error) return { ok: true, message: successMessage };
  return { ok: false, message: mapAccessControlError(error.code) };
}

export async function createRole(input: {
  code: string;
  name: string;
  description: string;
  roleType: RoleType;
  reason: string;
}): Promise<AccessControlActionState> {
  return executeMutation('admin_create_role', {
    p_code: input.code,
    p_name: input.name,
    p_description: input.description,
    p_role_type: input.roleType,
    p_reason: input.reason,
  }, 'Role created.');
}

export async function updateRole(input: {
  roleId: string;
  code: string;
  name: string;
  description: string;
  roleType: RoleType;
  reason: string;
}): Promise<AccessControlActionState> {
  return executeMutation('admin_update_role', {
    p_role_id: input.roleId,
    p_code: input.code,
    p_name: input.name,
    p_description: input.description,
    p_role_type: input.roleType,
    p_reason: input.reason,
  }, 'Role updated.');
}

export async function setRoleActive(input: {
  roleId: string;
  isActive: boolean;
  reason: string;
}): Promise<AccessControlActionState> {
  return executeMutation('admin_set_role_active', {
    p_role_id: input.roleId,
    p_is_active: input.isActive,
    p_reason: input.reason,
  }, input.isActive ? 'Role activated.' : 'Role deactivated.');
}

export async function retireRole(input: {
  roleId: string;
  reason: string;
}): Promise<AccessControlActionState> {
  return executeMutation('admin_retire_role', {
    p_role_id: input.roleId,
    p_reason: input.reason,
  }, 'Role retired.');
}

export async function grantRolePermission(input: {
  roleId: string;
  permissionCode: string;
  reason: string;
}): Promise<AccessControlActionState> {
  return executeMutation('admin_grant_role_permission', {
    p_role_id: input.roleId,
    p_permission_code: input.permissionCode,
    p_reason: input.reason,
  }, 'Permission granted.');
}

export async function revokeRolePermission(input: {
  roleId: string;
  permissionCode: string;
  reason: string;
}): Promise<AccessControlActionState> {
  return executeMutation('admin_revoke_role_permission', {
    p_role_id: input.roleId,
    p_permission_code: input.permissionCode,
    p_reason: input.reason,
  }, 'Permission revoked.');
}

export async function assignUserRole(input: {
  userId: string;
  roleId: string;
  reason: string;
}): Promise<AccessControlActionState> {
  return executeMutation('admin_assign_user_role', {
    p_user_id: input.userId,
    p_role_id: input.roleId,
    p_reason: input.reason,
  }, 'Role assigned.');
}

export async function revokeUserRole(input: {
  userId: string;
  roleId: string;
  reason: string;
}): Promise<AccessControlActionState> {
  return executeMutation('admin_revoke_user_role', {
    p_user_id: input.userId,
    p_role_id: input.roleId,
    p_reason: input.reason,
  }, 'Role revoked.');
}

export async function grantDataScope(input: {
  userId: string;
  scopeCode: string;
  scopeType: string;
  reason: string;
}): Promise<AccessControlActionState> {
  return executeMutation('admin_grant_data_scope', {
    p_user_id: input.userId,
    p_scope_code: input.scopeCode,
    p_scope_type: input.scopeType,
    p_reason: input.reason,
  }, 'Data scope granted.');
}

export async function revokeDataScope(input: {
  userId: string;
  scopeCode: string;
  reason: string;
}): Promise<AccessControlActionState> {
  return executeMutation('admin_revoke_data_scope', {
    p_user_id: input.userId,
    p_scope_code: input.scopeCode,
    p_reason: input.reason,
  }, 'Data scope revoked.');
}

export async function grantUserCompartment(input: {
  userId: string;
  compartment: SecurityClassification;
  reason: string;
}): Promise<AccessControlActionState> {
  return executeMutation('admin_grant_user_compartment', {
    p_user_id: input.userId,
    p_compartment_code: input.compartment,
    p_reason: input.reason,
  }, 'Compartment granted.');
}

export async function revokeUserCompartment(input: {
  userId: string;
  compartment: SecurityClassification;
  reason: string;
}): Promise<AccessControlActionState> {
  return executeMutation('admin_revoke_user_compartment', {
    p_user_id: input.userId,
    p_compartment_code: input.compartment,
    p_reason: input.reason,
  }, 'Compartment revoked.');
}

export async function setUserActive(input: {
  userId: string;
  isActive: boolean;
  reason: string;
}): Promise<AccessControlActionState> {
  return executeMutation('admin_set_user_active', {
    p_user_id: input.userId,
    p_is_active: input.isActive,
    p_reason: input.reason,
  }, input.isActive ? 'User activated.' : 'User suspended.');
}

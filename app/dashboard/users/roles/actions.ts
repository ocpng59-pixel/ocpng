'use server';

import { revalidatePath } from 'next/cache';
import {
  createRole,
  grantRolePermission,
  retireRole,
  revokeRolePermission,
  setRoleActive,
  updateRole,
} from '@/lib/access-control/mutations';
import type { AccessControlActionState } from '@/lib/access-control/types';
import {
  parseReason,
  parseRoleForm,
  parseRolePermissionChange,
} from '@/lib/access-control/validation';

function value(formData: FormData, key: string): string {
  const candidate = formData.get(key);
  return typeof candidate === 'string' ? candidate : '';
}

function invalid(fieldErrors: Record<string, string>): AccessControlActionState {
  return { ok: false, message: 'Review the submitted access-control fields.', fieldErrors };
}

function refreshRolePaths(roleId?: string) {
  revalidatePath('/dashboard/users/roles');
  revalidatePath('/dashboard/users/permissions');
  if (roleId) revalidatePath(`/dashboard/users/roles/${roleId}`);
}

export async function createRoleAction(
  _previousState: AccessControlActionState,
  formData: FormData,
): Promise<AccessControlActionState> {
  const parsed = parseRoleForm({
    code: value(formData, 'code'),
    name: value(formData, 'name'),
    description: value(formData, 'description'),
    roleType: value(formData, 'roleType'),
    reason: value(formData, 'reason'),
  });
  if (!parsed.success) return invalid(parsed.fieldErrors);

  const result = await createRole(parsed.data);
  if (result.ok) refreshRolePaths();
  return result;
}

export async function updateRoleAction(
  _previousState: AccessControlActionState,
  formData: FormData,
): Promise<AccessControlActionState> {
  const roleId = value(formData, 'roleId');
  const parsed = parseRoleForm({
    code: value(formData, 'code'),
    name: value(formData, 'name'),
    description: value(formData, 'description'),
    roleType: value(formData, 'roleType'),
    reason: value(formData, 'reason'),
  });
  if (!parsed.success) return invalid(parsed.fieldErrors);

  const result = await updateRole({ roleId, ...parsed.data });
  if (result.ok) refreshRolePaths(roleId);
  return result;
}

export async function setRoleActiveAction(
  _previousState: AccessControlActionState,
  formData: FormData,
): Promise<AccessControlActionState> {
  const roleId = value(formData, 'roleId');
  const parsedReason = parseReason(value(formData, 'reason'));
  if (!parsedReason.success) return invalid({ reason: 'Administrative reason is required.' });

  const result = await setRoleActive({
    roleId,
    isActive: value(formData, 'isActive') === 'true',
    reason: parsedReason.data,
  });
  if (result.ok) refreshRolePaths(roleId);
  return result;
}

export async function retireRoleAction(
  _previousState: AccessControlActionState,
  formData: FormData,
): Promise<AccessControlActionState> {
  const roleId = value(formData, 'roleId');
  const parsedReason = parseReason(value(formData, 'reason'));
  if (!parsedReason.success) return invalid({ reason: 'Administrative reason is required.' });

  const result = await retireRole({ roleId, reason: parsedReason.data });
  if (result.ok) refreshRolePaths(roleId);
  return result;
}

async function rolePermissionAction(
  formData: FormData,
  mutation: typeof grantRolePermission | typeof revokeRolePermission,
): Promise<AccessControlActionState> {
  const parsed = parseRolePermissionChange({
    roleId: value(formData, 'roleId'),
    permissionCode: value(formData, 'permissionCode'),
    reason: value(formData, 'reason'),
  });
  if (!parsed.success) return invalid(parsed.fieldErrors);

  const result = await mutation(parsed.data);
  if (result.ok) refreshRolePaths(parsed.data.roleId);
  return result;
}

export async function grantRolePermissionAction(
  _previousState: AccessControlActionState,
  formData: FormData,
): Promise<AccessControlActionState> {
  return rolePermissionAction(formData, grantRolePermission);
}

export async function revokeRolePermissionAction(
  _previousState: AccessControlActionState,
  formData: FormData,
): Promise<AccessControlActionState> {
  return rolePermissionAction(formData, revokeRolePermission);
}

'use server';

import { revalidatePath } from 'next/cache';
import { inviteApplicationUser } from '@/lib/access-control/invitations';
import {
  assignUserRole,
  grantDataScope,
  grantUserCompartment,
  revokeDataScope,
  revokeUserCompartment,
  revokeUserRole,
  setUserActive,
} from '@/lib/access-control/mutations';
import type { AccessControlActionState } from '@/lib/access-control/types';
import {
  parseCompartmentChange,
  parseUserInvite,
  parseUserRoleChange,
  parseUserScopeChange,
  parseUserScopeRevoke,
  parseUserStatusChange,
} from '@/lib/access-control/validation';

function value(formData: FormData, key: string): string {
  const candidate = formData.get(key);
  return typeof candidate === 'string' ? candidate : '';
}

function invalid(fieldErrors: Record<string, string>): AccessControlActionState {
  return { ok: false, message: 'Review the submitted access-control fields.', fieldErrors };
}

function refreshUserPaths(userId: string) {
  revalidatePath('/dashboard/users');
  revalidatePath('/dashboard/users/scopes-compartments');
  revalidatePath(`/dashboard/users/${userId}`);
  revalidatePath(`/dashboard/users/${userId}/access`);
}

export async function inviteUserAction(
  _previousState: AccessControlActionState,
  formData: FormData,
): Promise<AccessControlActionState> {
  const parsed = parseUserInvite({
    email: value(formData, 'email'),
    displayName: value(formData, 'displayName'),
    reason: value(formData, 'reason'),
  });
  if (!parsed.success) return invalid(parsed.fieldErrors);

  const result = await inviteApplicationUser(parsed.data);
  if (result.ok) {
    revalidatePath('/dashboard/users');
    revalidatePath('/dashboard/users/scopes-compartments');
  }
  return result;
}

async function roleAction(
  formData: FormData,
  mutation: typeof assignUserRole | typeof revokeUserRole,
): Promise<AccessControlActionState> {
  const parsed = parseUserRoleChange({
    userId: value(formData, 'userId'),
    roleId: value(formData, 'roleId'),
    reason: value(formData, 'reason'),
  });
  if (!parsed.success) return invalid(parsed.fieldErrors);

  const result = await mutation(parsed.data);
  if (result.ok) refreshUserPaths(parsed.data.userId);
  return result;
}

export async function assignUserRoleAction(
  _previousState: AccessControlActionState,
  formData: FormData,
): Promise<AccessControlActionState> {
  return roleAction(formData, assignUserRole);
}

export async function revokeUserRoleAction(
  _previousState: AccessControlActionState,
  formData: FormData,
): Promise<AccessControlActionState> {
  return roleAction(formData, revokeUserRole);
}

export async function grantDataScopeAction(
  _previousState: AccessControlActionState,
  formData: FormData,
): Promise<AccessControlActionState> {
  const parsed = parseUserScopeChange({
    userId: value(formData, 'userId'),
    scopeCode: value(formData, 'scopeCode'),
    scopeType: value(formData, 'scopeType'),
    reason: value(formData, 'reason'),
  });
  if (!parsed.success) return invalid(parsed.fieldErrors);

  const result = await grantDataScope(parsed.data);
  if (result.ok) refreshUserPaths(parsed.data.userId);
  return result;
}

export async function revokeDataScopeAction(
  _previousState: AccessControlActionState,
  formData: FormData,
): Promise<AccessControlActionState> {
  const parsed = parseUserScopeRevoke({
    userId: value(formData, 'userId'),
    scopeCode: value(formData, 'scopeCode'),
    reason: value(formData, 'reason'),
  });
  if (!parsed.success) return invalid(parsed.fieldErrors);

  const result = await revokeDataScope(parsed.data);
  if (result.ok) refreshUserPaths(parsed.data.userId);
  return result;
}

async function compartmentAction(
  formData: FormData,
  mutation: typeof grantUserCompartment | typeof revokeUserCompartment,
): Promise<AccessControlActionState> {
  const parsed = parseCompartmentChange({
    userId: value(formData, 'userId'),
    compartment: value(formData, 'compartment'),
    reason: value(formData, 'reason'),
  });
  if (!parsed.success) return invalid(parsed.fieldErrors);

  const result = await mutation(parsed.data);
  if (result.ok) refreshUserPaths(parsed.data.userId);
  return result;
}

export async function grantUserCompartmentAction(
  _previousState: AccessControlActionState,
  formData: FormData,
): Promise<AccessControlActionState> {
  return compartmentAction(formData, grantUserCompartment);
}

export async function revokeUserCompartmentAction(
  _previousState: AccessControlActionState,
  formData: FormData,
): Promise<AccessControlActionState> {
  return compartmentAction(formData, revokeUserCompartment);
}

export async function setUserActiveAction(
  _previousState: AccessControlActionState,
  formData: FormData,
): Promise<AccessControlActionState> {
  const parsed = parseUserStatusChange({
    userId: value(formData, 'userId'),
    isActive: value(formData, 'isActive') === 'true',
    reason: value(formData, 'reason'),
  });
  if (!parsed.success) return invalid(parsed.fieldErrors);

  const result = await setUserActive(parsed.data);
  if (result.ok) refreshUserPaths(parsed.data.userId);
  return result;
}

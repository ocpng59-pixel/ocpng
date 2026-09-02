import { z } from 'zod';
import type {
  RoleFormInput,
  ScopeFormInput,
  SecurityClassification,
} from '@/lib/access-control/types';

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; fieldErrors: Record<string, string> };

const roleCode = z.string().trim().regex(/^[a-z0-9_]{3,64}$/);
const roleType = z.enum(['operational', 'administrative', 'training']);
const reason = z.string().trim().min(3).max(500);
const scopeCode = z.string().trim().min(1).max(100);
const scopeType = z.string().trim().min(1).max(100);
const email = z.string().trim().email();
const uuid = z.string().uuid();
const roleName = z.string().trim().min(1).max(160);
const roleDescription = z.string().trim().max(1000);
const displayName = z.string().trim().min(1).max(160);
const compartment = z.enum([
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
  'LEADERSHIP_RESTRICTED',
  'ANNUAL_STATEMENT_SECRET',
  'INTELLIGENCE_SECRET',
  'LEGAL_PRIVILEGE',
]);

const roleFormSchema = z.object({
  code: roleCode,
  name: roleName,
  description: roleDescription,
  roleType,
  reason,
});

const scopeFormSchema = z.object({
  scopeCode,
  scopeType,
  reason,
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : 'form';
    if (!result[key]) result[key] = 'The submitted value is invalid.';
  }
  return result;
}

function parseWithSchema<T>(schema: z.ZodType<T>, value: unknown): ValidationResult<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { success: true, data: parsed.data };
  return { success: false, fieldErrors: fieldErrors(parsed.error) };
}

export function parseReason(value: unknown): ValidationResult<string> {
  return parseWithSchema(reason, value);
}

export function parseEmail(value: unknown): ValidationResult<string> {
  return parseWithSchema(email, value);
}

export function parseRoleForm(value: unknown): ValidationResult<RoleFormInput> {
  return parseWithSchema(roleFormSchema, value);
}

export function parseScope(value: unknown): ValidationResult<ScopeFormInput> {
  return parseWithSchema(scopeFormSchema, value);
}

export function parseUserInvite(value: unknown): ValidationResult<{ email: string; displayName: string; reason: string }> {
  return parseWithSchema(z.object({ email, displayName, reason }), value);
}

export function parseUserRoleChange(value: unknown): ValidationResult<{ userId: string; roleId: string; reason: string }> {
  return parseWithSchema(z.object({ userId: uuid, roleId: uuid, reason }), value);
}

export function parseRolePermissionChange(value: unknown): ValidationResult<{ roleId: string; permissionCode: string; reason: string }> {
  return parseWithSchema(z.object({
    roleId: uuid,
    permissionCode: z.string().trim().min(3).max(120).regex(/^[a-z0-9_.]+$/),
    reason,
  }), value);
}

export function parseUserScopeChange(value: unknown): ValidationResult<{
  userId: string;
  scopeCode: string;
  scopeType: string;
  reason: string;
}> {
  return parseWithSchema(z.object({ userId: uuid, scopeCode, scopeType, reason }), value);
}

export function parseUserScopeRevoke(value: unknown): ValidationResult<{
  userId: string;
  scopeCode: string;
  reason: string;
}> {
  return parseWithSchema(z.object({ userId: uuid, scopeCode, reason }), value);
}

export function parseCompartmentChange(value: unknown): ValidationResult<{
  userId: string;
  compartment: SecurityClassification;
  reason: string;
}> {
  return parseWithSchema(z.object({ userId: uuid, compartment, reason }), value);
}

export function parseUserStatusChange(value: unknown): ValidationResult<{ userId: string; isActive: boolean; reason: string }> {
  return parseWithSchema(z.object({ userId: uuid, isActive: z.boolean(), reason }), value);
}

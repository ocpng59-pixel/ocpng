import type { PermissionCode, SecurityClassification } from './types';

export interface AccessContext {
  userId: string;
  permissions: ReadonlySet<PermissionCode>;
  organisationScopes: ReadonlySet<string>;
  caseAssignments: ReadonlySet<string>;
  compartments: ReadonlySet<SecurityClassification>;
  isSystemAdministrator?: boolean;
}

export interface ProtectedRecord {
  id: string;
  classification: SecurityClassification;
  organisationScope?: string | null;
  caseId?: string | null;
}

const unrestrictedClassifications = new Set<SecurityClassification>(['PUBLIC', 'INTERNAL']);

export function canAccessRecord(context: AccessContext, record: ProtectedRecord, permission: PermissionCode): boolean {
  if (!context.permissions.has(permission)) return false;

  const scopeAllowed = !record.organisationScope || context.organisationScopes.has(record.organisationScope);
  const assignmentAllowed = Boolean(record.caseId && context.caseAssignments.has(record.caseId));
  if (!scopeAllowed && !assignmentAllowed) return false;

  if (unrestrictedClassifications.has(record.classification)) return true;
  return context.compartments.has(record.classification);
}

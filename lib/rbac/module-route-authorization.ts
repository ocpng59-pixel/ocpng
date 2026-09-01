import type { ModulePageDefinition } from '@/lib/config/module-pages';
import type { PermissionCode, SecurityClassification } from './types';

type ModuleRouteAuthorizationChecks = {
  hasPermission: (permission: PermissionCode) => Promise<boolean>;
  hasCompartment: (classification: SecurityClassification) => Promise<boolean>;
};

const NO_COMPARTMENT_REQUIRED = new Set<SecurityClassification>([
  'PUBLIC',
  'INTERNAL',
]);

async function safeCheck<T>(check: (value: T) => Promise<boolean>, value: T) {
  try {
    return await check(value);
  } catch {
    return false;
  }
}

export async function isModuleRouteAuthorized(
  page: ModulePageDefinition,
  checks: ModuleRouteAuthorizationChecks,
): Promise<boolean> {
  const hasPermission = await safeCheck(checks.hasPermission, page.permission);
  if (!hasPermission) return false;

  if (NO_COMPARTMENT_REQUIRED.has(page.classification)) return true;

  return safeCheck(checks.hasCompartment, page.classification);
}

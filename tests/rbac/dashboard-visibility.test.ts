import { describe, expect, it } from 'vitest';
import * as RouteAuthorization from '@/lib/rbac/module-route-authorization';
import type { PermissionCode, SecurityClassification } from '@/lib/rbac/types';

type AccessChecks = {
  hasPermission: (permission: PermissionCode) => Promise<boolean>;
  hasCompartment: (classification: SecurityClassification) => Promise<boolean>;
};

type AccessResolver = (
  permission: PermissionCode,
  classification: SecurityClassification,
  checks: AccessChecks,
) => Promise<boolean>;

function resolver(): AccessResolver {
  const candidate = (
    RouteAuthorization as unknown as {
      isPermissionAndClassificationAuthorized?: AccessResolver;
    }
  ).isPermissionAndClassificationAuthorized;

  expect(typeof candidate).toBe('function');
  return candidate as AccessResolver;
}

function checks(
  permissions: PermissionCode[],
  compartments: SecurityClassification[],
): AccessChecks {
  return {
    hasPermission: async (permission) => permissions.includes(permission),
    hasCompartment: async (classification) => compartments.includes(classification),
  };
}

describe('permission-aware Executive Overview', () => {
  it('allows an Investigator complaint and investigation surfaces but not screening, Leadership or Compliance surfaces', async () => {
    const authorize = resolver();
    const investigator = checks(
      [
        'dashboard.view',
        'complaints.view',
        'investigations.view',
        'investigations.manage',
        'evidence.manage',
        'tasks.view',
        'notifications.view',
      ],
      ['CONFIDENTIAL'],
    );

    await expect(
      authorize('complaints.view', 'CONFIDENTIAL', investigator),
    ).resolves.toBe(true);
    await expect(
      authorize('investigations.view', 'CONFIDENTIAL', investigator),
    ).resolves.toBe(true);
    await expect(
      authorize('complaints.screen', 'CONFIDENTIAL', investigator),
    ).resolves.toBe(false);
    await expect(
      authorize('leadership.view_restricted', 'LEADERSHIP_RESTRICTED', investigator),
    ).resolves.toBe(false);
    await expect(
      authorize('compliance.view', 'CONFIDENTIAL', investigator),
    ).resolves.toBe(false);
  });

  it('requires a protected compartment even when the functional permission is present', async () => {
    const authorize = resolver();
    const permissionOnly = checks(['leadership.view_restricted'], []);

    await expect(
      authorize(
        'leadership.view_restricted',
        'LEADERSHIP_RESTRICTED',
        permissionOnly,
      ),
    ).resolves.toBe(false);
  });

  it('fails closed when an authorization dependency errors', async () => {
    const authorize = resolver();

    await expect(
      authorize('complaints.view', 'CONFIDENTIAL', {
        hasPermission: async () => {
          throw new Error('permission service unavailable');
        },
        hasCompartment: async () => true,
      }),
    ).resolves.toBe(false);
  });
});

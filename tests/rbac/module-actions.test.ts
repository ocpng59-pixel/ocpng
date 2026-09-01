import { describe, expect, it } from 'vitest';
import { MODULE_PAGES } from '@/lib/config/module-pages';
import * as RouteAuthorization from '@/lib/rbac/module-route-authorization';
import type { PermissionCode, SecurityClassification } from '@/lib/rbac/types';

type ActionDefinition = {
  label: string;
  permission: PermissionCode;
};

type AccessChecks = {
  hasPermission: (permission: PermissionCode) => Promise<boolean>;
  hasCompartment: (classification: SecurityClassification) => Promise<boolean>;
};

type ActionResolver = (
  actions: ActionDefinition[],
  classification: SecurityClassification,
  checks: AccessChecks,
) => Promise<ActionDefinition[]>;

function resolver(): ActionResolver {
  const candidate = (
    RouteAuthorization as unknown as {
      resolveAuthorizedModuleActions?: ActionResolver;
    }
  ).resolveAuthorizedModuleActions;

  expect(typeof candidate).toBe('function');
  return candidate as ActionResolver;
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

function complaintRegisterActions(): ActionDefinition[] {
  const actions = MODULE_PAGES['/dashboard/complaints'].actions as unknown[];
  return actions as ActionDefinition[];
}

describe('permission-aware module actions', () => {
  it('assigns explicit permissions to Complaint Register actions', () => {
    expect(complaintRegisterActions()).toEqual([
      { label: 'Register complaint', permission: 'complaints.create' },
      { label: 'Open screening queue', permission: 'complaints.screen' },
      { label: 'Review referrals', permission: 'complaints.view' },
    ]);
  });

  it('shows an Investigator only Complaint Register actions they are authorised to use', async () => {
    const authorizeActions = resolver();
    const investigator = checks(
      ['complaints.view', 'investigations.view', 'investigations.manage', 'evidence.manage'],
      ['CONFIDENTIAL'],
    );

    await expect(
      authorizeActions(complaintRegisterActions(), 'CONFIDENTIAL', investigator),
    ).resolves.toEqual([
      { label: 'Review referrals', permission: 'complaints.view' },
    ]);
  });

  it('shows all Complaint Register actions when all required permissions are present', async () => {
    const authorizeActions = resolver();
    const intakeOfficer = checks(
      ['complaints.view', 'complaints.create', 'complaints.screen'],
      ['CONFIDENTIAL'],
    );

    await expect(
      authorizeActions(complaintRegisterActions(), 'CONFIDENTIAL', intakeOfficer),
    ).resolves.toEqual(complaintRegisterActions());
  });

  it('fails closed for action authorization errors', async () => {
    const authorizeActions = resolver();

    await expect(
      authorizeActions(
        [{ label: 'Register complaint', permission: 'complaints.create' }],
        'CONFIDENTIAL',
        {
          hasPermission: async () => {
            throw new Error('permission service unavailable');
          },
          hasCompartment: async () => true,
        },
      ),
    ).resolves.toEqual([]);
  });
});

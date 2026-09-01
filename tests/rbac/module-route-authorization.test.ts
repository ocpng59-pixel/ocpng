import { describe, expect, it } from 'vitest';
import { getModulePage } from '@/lib/config/module-pages';
import * as ModuleRouteAuthorization from '@/lib/rbac/module-route-authorization';
import type { PermissionCode, SecurityClassification } from '@/lib/rbac/types';

type CheckContext = {
  permissions: PermissionCode[];
  compartments?: SecurityClassification[];
};

function checks({ permissions, compartments = [] }: CheckContext) {
  return {
    hasPermission: async (permission: PermissionCode) => permissions.includes(permission),
    hasCompartment: async (classification: SecurityClassification) =>
      compartments.includes(classification),
  };
}

describe('direct module-route authorization', () => {
  it('allows an INTERNAL administration route with its required permission', async () => {
    expect(typeof ModuleRouteAuthorization.isModuleRouteAuthorized).toBe('function');

    const allowed = await ModuleRouteAuthorization.isModuleRouteAuthorized(
      getModulePage('/dashboard/users'),
      checks({ permissions: ['admin.manage_users'] }),
    );

    expect(allowed).toBe(true);
  });

  it('denies a route when its functional permission is missing', async () => {
    const allowed = await ModuleRouteAuthorization.isModuleRouteAuthorized(
      getModulePage('/dashboard/users'),
      checks({ permissions: [] }),
    );

    expect(allowed).toBe(false);
  });

  it('requires both permission and matching compartment for protected routes', async () => {
    const annualStatements = getModulePage('/dashboard/annual-statements');

    const withoutCompartment = await ModuleRouteAuthorization.isModuleRouteAuthorized(
      annualStatements,
      checks({ permissions: ['annual_statements.view_secret'] }),
    );
    const withCompartment = await ModuleRouteAuthorization.isModuleRouteAuthorized(
      annualStatements,
      checks({
        permissions: ['annual_statements.view_secret'],
        compartments: ['ANNUAL_STATEMENT_SECRET'],
      }),
    );

    expect(withoutCompartment).toBe(false);
    expect(withCompartment).toBe(true);
  });

  it('gives System Administrator no protected-route bypass', async () => {
    const administratorPermissions: PermissionCode[] = [
      'dashboard.view',
      'admin.manage_users',
      'admin.manage_roles',
      'admin.manage_settings',
      'audit.view',
    ];

    for (const pathname of [
      '/dashboard/annual-statements',
      '/dashboard/legal',
      '/dashboard/intelligence',
      '/dashboard/commission',
      '/dashboard/audit-log',
    ]) {
      const allowed = await ModuleRouteAuthorization.isModuleRouteAuthorized(
        getModulePage(pathname),
        checks({ permissions: administratorPermissions }),
      );
      expect(allowed, pathname).toBe(false);
    }
  });

  it('fails closed when a permission or compartment check errors', async () => {
    const usersAllowed = await ModuleRouteAuthorization.isModuleRouteAuthorized(
      getModulePage('/dashboard/users'),
      {
        hasPermission: async () => {
          throw new Error('permission service unavailable');
        },
        hasCompartment: async () => true,
      },
    );

    const legalAllowed = await ModuleRouteAuthorization.isModuleRouteAuthorized(
      getModulePage('/dashboard/legal'),
      {
        hasPermission: async () => true,
        hasCompartment: async () => {
          throw new Error('compartment service unavailable');
        },
      },
    );

    expect(usersAllowed).toBe(false);
    expect(legalAllowed).toBe(false);
  });
});

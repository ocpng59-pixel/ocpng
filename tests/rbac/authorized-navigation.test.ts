import { describe, expect, it } from 'vitest';
import { NAVIGATION } from '@/lib/rbac/navigation';
import * as AuthorizedNavigation from '@/lib/rbac/authorized-navigation';
import type { PermissionCode, SecurityClassification } from '@/lib/rbac/types';

function context(
  permissions: PermissionCode[],
  compartments: SecurityClassification[] = [],
) {
  return {
    permissions: new Set<PermissionCode>(permissions),
    compartments: new Set<SecurityClassification>(compartments),
  };
}

function hrefs(sections: { items: { href: string }[] }[]) {
  return sections.flatMap((section) => section.items.map((item) => item.href));
}

describe('permission-aware navigation', () => {
  it('exports a navigation filter that removes items without required permission', () => {
    expect(typeof AuthorizedNavigation.filterNavigationForAccess).toBe('function');

    const filtered = AuthorizedNavigation.filterNavigationForAccess(
      NAVIGATION,
      context(['dashboard.view', 'reports.view']),
    );

    expect(hrefs(filtered)).toEqual(['/dashboard', '/dashboard/reports']);
  });

  it('requires the matching compartment for protected navigation', () => {
    const withoutCompartment = AuthorizedNavigation.filterNavigationForAccess(
      NAVIGATION,
      context(['legal.view_privileged']),
    );
    const withCompartment = AuthorizedNavigation.filterNavigationForAccess(
      NAVIGATION,
      context(['legal.view_privileged'], ['LEGAL_PRIVILEGE']),
    );

    expect(hrefs(withoutCompartment)).not.toContain('/dashboard/legal');
    expect(hrefs(withCompartment)).toContain('/dashboard/legal');
  });

  it('does not treat System Administrator permissions as a protected-content bypass', () => {
    const filtered = AuthorizedNavigation.filterNavigationForAccess(
      NAVIGATION,
      context([
        'dashboard.view',
        'admin.manage_users',
        'admin.manage_roles',
        'admin.manage_settings',
        'audit.view',
      ]),
    );

    const visible = hrefs(filtered);
    expect(visible).toContain('/dashboard/users');
    expect(visible).toContain('/dashboard/users/roles');
    expect(visible).toContain('/dashboard/settings');
    expect(visible).not.toContain('/dashboard/audit-log');
    expect(visible).not.toContain('/dashboard/leadership');
    expect(visible).not.toContain('/dashboard/annual-statements');
    expect(visible).not.toContain('/dashboard/legal');
    expect(visible).not.toContain('/dashboard/intelligence');
  });

  it('shows Leadership and Annual Statements only for matching permission plus compartment', () => {
    const filtered = AuthorizedNavigation.filterNavigationForAccess(
      NAVIGATION,
      context(
        ['leadership.view_restricted', 'annual_statements.view_secret'],
        ['LEADERSHIP_RESTRICTED', 'ANNUAL_STATEMENT_SECRET'],
      ),
    );

    expect(hrefs(filtered)).toEqual([
      '/dashboard/leadership',
      '/dashboard/annual-statements',
    ]);
  });

  it('removes sections that have no authorized items', () => {
    const filtered = AuthorizedNavigation.filterNavigationForAccess(
      NAVIGATION,
      context(['reports.view']),
    );

    expect(filtered.map((section) => section.title)).toEqual(['Reports']);
  });

  it('fails closed when a server authorization check errors', async () => {
    expect(typeof AuthorizedNavigation.resolveAuthorizedNavigation).toBe('function');

    const filtered = await AuthorizedNavigation.resolveAuthorizedNavigation(NAVIGATION, {
      hasPermission: async (permission) => {
        if (permission === 'dashboard.view') throw new Error('authorization service unavailable');
        return permission === 'reports.view';
      },
      hasCompartment: async () => false,
    });

    expect(hrefs(filtered)).not.toContain('/dashboard');
    expect(hrefs(filtered)).toContain('/dashboard/reports');
  });

  it('keeps compartment checks independent across Legal and Intelligence modules', async () => {
    const filtered = await AuthorizedNavigation.resolveAuthorizedNavigation(NAVIGATION, {
      hasPermission: async (permission) =>
        permission === 'legal.view_privileged' || permission === 'intelligence.view_secret',
      hasCompartment: async (classification) => classification === 'LEGAL_PRIVILEGE',
    });

    expect(hrefs(filtered)).toContain('/dashboard/legal');
    expect(hrefs(filtered)).not.toContain('/dashboard/intelligence');
  });
});

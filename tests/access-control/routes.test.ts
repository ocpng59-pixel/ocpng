import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const paths = {
  actions: 'app/dashboard/users/roles/actions.ts',
  roles: 'app/dashboard/users/roles/page.tsx',
  newRole: 'app/dashboard/users/roles/new/page.tsx',
  roleDetail: 'app/dashboard/users/roles/[roleId]/page.tsx',
  permissions: 'app/dashboard/users/permissions/page.tsx',
  actionMessage: 'components/access-control/action-message.tsx',
  roleForm: 'components/access-control/role-form.tsx',
  permissionMatrix: 'components/access-control/permission-matrix.tsx',
} as const;

function source(path: string): string {
  expect(existsSync(path), `Expected ${path} to exist`).toBe(true);
  return readFileSync(path, 'utf8');
}

describe('WASDOK-78 role administration routes', () => {
  it('creates all dedicated role administration route and component files', () => {
    for (const path of Object.values(paths)) {
      expect(existsSync(path), `Expected ${path} to exist`).toBe(true);
    }
  });

  it('turns Review roles and Create role into routed controls rather than dead action spans', () => {
    const roles = source(paths.roles);
    expect(roles).toContain('Roles, Permissions & Compartments');
    expect(roles).toContain('Review roles');
    expect(roles).toContain('/dashboard/users/roles');
    expect(roles).toContain('Create role');
    expect(roles).toContain('/dashboard/users/roles/new');
    expect(roles).not.toMatch(/<span[^>]*className=["']oc-action["'][^>]*>\s*Review roles\s*<\/span>/);
    expect(roles).not.toMatch(/<span[^>]*className=["']oc-action["'][^>]*>\s*Grant compartment\s*<\/span>/);
  });

  it('renders the required role catalogue columns and administration navigation', () => {
    const roles = source(paths.roles);
    for (const label of ['Code', 'Name', 'Type', 'Status', 'Users', 'Permissions']) {
      expect(roles).toContain(label);
    }
    expect(roles).toContain('/dashboard/users/permissions');
    expect(roles).toContain('/dashboard/users/scopes-compartments');
    expect(roles).toContain('/dashboard/audit-log');
  });

  it('keeps the permission catalogue read-only', () => {
    const permissions = source(paths.permissions);
    expect(permissions).toContain('Permission Catalogue');
    expect(permissions).toContain('listPermissions');
    expect(permissions).not.toMatch(/Create permission/i);
    expect(permissions).not.toMatch(/admin_create_permission/);
  });

  it('implements server-only role actions through trusted Task 5 adapters', () => {
    const actions = source(paths.actions);
    expect(actions.startsWith("'use server'\n") || actions.startsWith("'use server';")).toBe(true);
    expect(actions).toContain("from '@/lib/access-control/validation'");
    expect(actions).toContain("from '@/lib/access-control/mutations'");
    expect(actions).toContain("revalidatePath('/dashboard/users/roles')");
    expect(actions).not.toMatch(/actorId|actor_id|grantedBy|granted_by|auditTimestamp|audit_timestamp/);
  });

  it('protects held roles in the detail UI and exposes the permission matrix', () => {
    const detail = source(paths.roleDetail);
    const matrix = source(paths.permissionMatrix);
    expect(detail).toContain('actorHoldsRole');
    expect(detail).toContain('PermissionMatrix');
    expect(detail).toContain('You cannot change a role currently assigned to your own account.');
    expect(matrix).toContain('permissionCode');
    expect(matrix).toContain('disabled');
  });
});

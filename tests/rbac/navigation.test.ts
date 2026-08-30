import { describe, expect, it } from 'vitest';
import { NAVIGATION } from '@/lib/rbac/navigation';
import { PERMISSIONS } from '@/lib/rbac/permissions';

describe('OCPNG navigation and permission catalogue', () => {
  it('contains every major Release 1 functional family', () => {
    const sections = NAVIGATION.map((section) => section.title);
    for (const required of ['Dashboard','Complaints','Investigations','Leadership','Government Oversight','Compliance','Commission','Legal','Intelligence','Reports','Administration']) {
      expect(sections).toContain(required);
    }
  });
  it('uses unique permission codes', () => {
    const codes = PERMISSIONS.map((permission) => permission.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
  it('requires permissions for every navigation item and excludes NJSS finance domains', () => {
    const serialised = JSON.stringify(NAVIGATION).toLowerCase();
    expect(serialised).not.toMatch(/ff3|ff4|expense ledger|budget allocation/);
    for (const section of NAVIGATION) for (const item of section.items) expect(item.permissions.length).toBeGreaterThan(0);
  });
});

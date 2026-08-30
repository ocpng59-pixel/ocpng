import { describe, expect, it } from 'vitest';
import { canAccessRecord } from '@/lib/rbac/access';

describe('record scope and security compartment access', () => {
  const record = { id: 'case-1', classification: 'LEADERSHIP_RESTRICTED' as const, organisationScope: 'leadership', caseId: 'case-1' };
  it('denies missing functional permission', () => {
    expect(canAccessRecord({ userId:'u', permissions:new Set(), organisationScopes:new Set(['leadership']), caseAssignments:new Set(['case-1']), compartments:new Set(['LEADERSHIP_RESTRICTED']) }, record, 'leadership.view_restricted')).toBe(false);
  });
  it('denies protected records without compartment even to a system administrator', () => {
    expect(canAccessRecord({ userId:'u', permissions:new Set(['leadership.view_restricted']), organisationScopes:new Set(['leadership']), caseAssignments:new Set(), compartments:new Set(), isSystemAdministrator:true }, record, 'leadership.view_restricted')).toBe(false);
  });
  it('allows explicit case assignment plus required compartment', () => {
    expect(canAccessRecord({ userId:'u', permissions:new Set(['leadership.view_restricted']), organisationScopes:new Set(), caseAssignments:new Set(['case-1']), compartments:new Set(['LEADERSHIP_RESTRICTED']) }, record, 'leadership.view_restricted')).toBe(true);
  });
});

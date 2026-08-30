import assert from 'node:assert/strict';
import { getPublicEnvironment, isSupabaseConfigured } from '../lib/config/environment.ts';
import { formatCaseNumber } from '../lib/cases/case-numbering.ts';
import { canTransitionComplaint } from '../lib/cases/workflow.ts';
import { canTransitionLeadership, canTransitionAnnualStatement, VARIANCE_FLAG_IS_FINDING } from '../lib/leadership/lifecycle.ts';
import { canTransitionCompliance } from '../lib/compliance/lifecycle.ts';
import { buildDashboardSnapshot } from '../lib/reporting/dashboard.ts';
import { canAccessRecord } from '../lib/rbac/access.ts';

assert.equal(getPublicEnvironment({ NEXT_PUBLIC_APP_ENV: 'development', OCPNG_STRICT_ENV: 'false' }).supabaseUrl, null);
assert.equal(isSupabaseConfigured({}), false);
assert.throws(() => getPublicEnvironment({ OCPNG_STRICT_ENV: 'true' }), /Supabase/);
assert.equal(formatCaseNumber('administrative', 2026, 1), 'OC-ADM-2026-000001');
assert.equal(canTransitionComplaint('draft_findings', 'right_to_be_heard'), true);
assert.equal(canTransitionComplaint('draft_findings', 'decision'), false);
assert.equal(canTransitionLeadership('right_to_be_heard', 'counsel_quality_review'), true);
assert.equal(canTransitionLeadership('right_to_be_heard', 'commission_consideration'), false);
assert.equal(canTransitionAnnualStatement('variance_flagged', 'explanation_requested'), true);
assert.equal(VARIANCE_FLAG_IS_FINDING, false);
assert.equal(canTransitionCompliance('review', 'implemented'), true);

const access = canAccessRecord({
  userId: 'u1',
  permissions: new Set(['leadership.view_restricted']),
  organisationScopes: new Set(['leadership']),
  caseAssignments: new Set(),
  compartments: new Set(['LEADERSHIP_RESTRICTED']),
  isSystemAdministrator: false,
}, { id: 'x', classification: 'LEADERSHIP_RESTRICTED', organisationScope: 'leadership' }, 'leadership.view_restricted');
assert.equal(access, true);

const deniedAdmin = canAccessRecord({
  userId: 'admin',
  permissions: new Set(['leadership.view_restricted']),
  organisationScopes: new Set(['leadership']),
  caseAssignments: new Set(),
  compartments: new Set(),
  isSystemAdministrator: true,
}, { id: 'x', classification: 'LEADERSHIP_RESTRICTED', organisationScope: 'leadership' }, 'leadership.view_restricted');
assert.equal(deniedAdmin, false);

const snap = buildDashboardSnapshot([
  { id:'1', receivedAt:'2026-08-25T00:00:00Z', status:'screening', dueAt:'2026-09-10T00:00:00Z' },
  { id:'2', receivedAt:'2026-05-01T00:00:00Z', status:'full_investigation', dueAt:'2026-08-01T00:00:00Z', isLeadership:true },
], [{ id:'r1', status:'implemented' }, { id:'r2', status:'open', dueAt:'2026-08-20T00:00:00Z' }], new Date('2026-08-31T00:00:00Z'));
assert.equal(snap.complaintsOpen, 2);
assert.equal(snap.complaintsOverdue, 1);
assert.equal(snap.leadershipMatters, 1);
assert.equal(snap.recommendations.implementationRate, 50);

console.log('WASDOK 360 domain smoke checks: PASS');

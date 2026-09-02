import { describe, expect, it } from 'vitest';
import {
  parseEmail,
  parseReason,
  parseRoleForm,
  parseScope,
} from '@/lib/access-control/validation';

describe('WASDOK-78 access control validation', () => {
  it('accepts a configurable training role', () => {
    expect(parseRoleForm({
      code: 'training_super_admin',
      name: 'Training Super Administrator',
      description: 'DEMO/UAT role',
      roleType: 'training',
      reason: 'Prepare controlled UAT access',
    }).success).toBe(true);
  });

  it('rejects an invalid role code', () => {
    expect(parseRoleForm({
      code: 'Chief Ombudsman!',
      name: 'Role',
      description: '',
      roleType: 'operational',
      reason: 'Change role',
    }).success).toBe(false);
  });

  it('rejects a short administrative reason', () => {
    expect(parseReason('x').success).toBe(false);
  });

  it('accepts the longest supported scope shape and rejects an empty scope', () => {
    expect(parseScope({ scopeCode: 'UAT-NCD', scopeType: 'organisation', reason: 'Grant UAT scope' }).success).toBe(true);
    expect(parseScope({ scopeCode: '', scopeType: 'organisation', reason: 'Grant UAT scope' }).success).toBe(false);
  });

  it('accepts a valid email and rejects malformed email input', () => {
    expect(parseEmail('uat.admin@example.invalid').success).toBe(true);
    expect(parseEmail('not-an-email').success).toBe(false);
  });
});

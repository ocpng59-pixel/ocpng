import { describe, expect, it } from 'vitest';
import { canTransitionComplaint } from '@/lib/cases/workflow';

describe('complaint workflow', () => {
  it('enforces screening and natural justice gates', () => {
    expect(canTransitionComplaint('jurisdiction_assessment','accepted')).toBe(true);
    expect(canTransitionComplaint('draft_findings','right_to_be_heard')).toBe(true);
    expect(canTransitionComplaint('right_to_be_heard','final_assessment')).toBe(true);
    expect(canTransitionComplaint('draft_findings','decision')).toBe(false);
  });
  it('supports decline, defer and referral exits', () => {
    expect(canTransitionComplaint('jurisdiction_assessment','declined')).toBe(true);
    expect(canTransitionComplaint('jurisdiction_assessment','deferred')).toBe(true);
    expect(canTransitionComplaint('jurisdiction_assessment','referred')).toBe(true);
  });
});

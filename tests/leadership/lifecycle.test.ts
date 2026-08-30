import { describe, expect, it } from 'vitest';
import { canTransitionAnnualStatement, canTransitionLeadership, VARIANCE_FLAG_IS_FINDING } from '@/lib/leadership/lifecycle';

describe('protected leadership lifecycles', () => {
  it('requires right-to-be-heard then counsel review before Commission consideration', () => {
    expect(canTransitionLeadership('evidence_review','right_to_be_heard')).toBe(true);
    expect(canTransitionLeadership('right_to_be_heard','counsel_quality_review')).toBe(true);
    expect(canTransitionLeadership('right_to_be_heard','commission_consideration')).toBe(false);
  });
  it('treats annual-statement variance flags as analytical prompts, not findings', () => {
    expect(VARIANCE_FLAG_IS_FINDING).toBe(false);
    expect(canTransitionAnnualStatement('comparative_review','variance_flagged')).toBe(true);
    expect(canTransitionAnnualStatement('variance_flagged','explanation_requested')).toBe(true);
  });
});

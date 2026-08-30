import { describe, expect, it } from 'vitest';
import { canTransitionCompliance } from '@/lib/compliance/lifecycle';

describe('recommendation compliance lifecycle', () => {
  it('tracks response, corrective action, evidence, review and outcome', () => {
    expect(canTransitionCompliance('issued','awaiting_response')).toBe(true);
    expect(canTransitionCompliance('response_received','corrective_action')).toBe(true);
    expect(canTransitionCompliance('evidence_submitted','review')).toBe(true);
    expect(canTransitionCompliance('review','implemented')).toBe(true);
  });
  it('supports escalation without bypassing review controls', () => {
    expect(canTransitionCompliance('awaiting_response','escalated')).toBe(true);
    expect(canTransitionCompliance('issued','implemented')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { buildDashboardSnapshot } from '@/lib/reporting/dashboard';

describe('executive dashboard aggregation', () => {
  it('aggregates complaint age, overdue, Leadership and recommendation compliance values', () => {
    const snapshot = buildDashboardSnapshot([
      { id:'1', receivedAt:'2026-08-25T00:00:00Z', status:'screening', dueAt:'2026-09-10T00:00:00Z' },
      { id:'2', receivedAt:'2026-07-01T00:00:00Z', status:'full_investigation', dueAt:'2026-08-01T00:00:00Z', isLeadership:true },
      { id:'3', receivedAt:'2026-05-01T00:00:00Z', status:'closed' },
    ], [
      { id:'r1', status:'implemented' },
      { id:'r2', status:'open', dueAt:'2026-08-20T00:00:00Z' },
    ], new Date('2026-08-31T00:00:00Z'));
    expect(snapshot.complaintsTotal).toBe(3);
    expect(snapshot.complaintsOpen).toBe(2);
    expect(snapshot.complaintsOverdue).toBe(1);
    expect(snapshot.leadershipMatters).toBe(1);
    expect(snapshot.ageBands.under30).toBe(1);
    expect(snapshot.ageBands.days30to89).toBe(1);
    expect(snapshot.recommendations.implementationRate).toBe(50);
    expect(snapshot.recommendations.overdue).toBe(1);
  });
});

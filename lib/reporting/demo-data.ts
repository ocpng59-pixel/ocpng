import type { DashboardComplaint, DashboardRecommendation } from './dashboard';

export const DEMO_DATA_NOTICE = 'DEMO — fictional UAT data only; not live Ombudsman Commission records.';

export const DEMO_COMPLAINTS: DashboardComplaint[] = [
  { id: 'DEMO-C-001', receivedAt: '2026-08-25T00:00:00Z', dueAt: '2026-09-10T00:00:00Z', status: 'screening' },
  { id: 'DEMO-C-002', receivedAt: '2026-06-01T00:00:00Z', dueAt: '2026-08-15T00:00:00Z', status: 'full_investigation' },
  { id: 'DEMO-L-001', receivedAt: '2026-07-10T00:00:00Z', dueAt: '2026-09-20T00:00:00Z', status: 'preliminary_investigation', isLeadership: true },
  { id: 'DEMO-C-003', receivedAt: '2026-05-01T00:00:00Z', status: 'closed' },
];

export const DEMO_RECOMMENDATIONS: DashboardRecommendation[] = [
  { id: 'DEMO-R-001', status: 'implemented' },
  { id: 'DEMO-R-002', status: 'partially_implemented', dueAt: '2026-08-20T00:00:00Z' },
  { id: 'DEMO-R-003', status: 'open', dueAt: '2026-09-30T00:00:00Z' },
];

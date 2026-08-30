export interface DashboardComplaint {
  id: string;
  receivedAt: string;
  status: string;
  dueAt?: string | null;
  isLeadership?: boolean;
}

export interface DashboardRecommendation {
  id: string;
  status: 'implemented' | 'partially_implemented' | 'not_implemented' | 'open';
  dueAt?: string | null;
}

export interface DashboardSnapshot {
  complaintsTotal: number;
  complaintsOpen: number;
  complaintsOverdue: number;
  leadershipMatters: number;
  ageBands: { under30: number; days30to89: number; days90plus: number };
  recommendations: { total: number; implemented: number; overdue: number; implementationRate: number };
}

const CLOSED = new Set(['closed','declined','referred']);

export function buildDashboardSnapshot(
  complaints: DashboardComplaint[],
  recommendations: DashboardRecommendation[],
  now = new Date(),
): DashboardSnapshot {
  const nowMs = now.getTime();
  const open = complaints.filter((item) => !CLOSED.has(item.status));
  const ageBands = { under30: 0, days30to89: 0, days90plus: 0 };

  for (const item of open) {
    const ageDays = Math.max(0, Math.floor((nowMs - new Date(item.receivedAt).getTime()) / 86400000));
    if (ageDays < 30) ageBands.under30 += 1;
    else if (ageDays < 90) ageBands.days30to89 += 1;
    else ageBands.days90plus += 1;
  }

  const implemented = recommendations.filter((item) => item.status === 'implemented').length;
  const overdueRecommendations = recommendations.filter((item) => item.status !== 'implemented' && item.dueAt && new Date(item.dueAt).getTime() < nowMs).length;

  return {
    complaintsTotal: complaints.length,
    complaintsOpen: open.length,
    complaintsOverdue: open.filter((item) => item.dueAt && new Date(item.dueAt).getTime() < nowMs).length,
    leadershipMatters: complaints.filter((item) => item.isLeadership && !CLOSED.has(item.status)).length,
    ageBands,
    recommendations: {
      total: recommendations.length,
      implemented,
      overdue: overdueRecommendations,
      implementationRate: recommendations.length ? Math.round((implemented / recommendations.length) * 100) : 0,
    },
  };
}

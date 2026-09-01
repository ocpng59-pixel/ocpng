import { MetricCard } from '@/components/metric-card';
import { WorkQueue } from '@/components/work-queue';
import { isPermissionAndClassificationAuthorized } from '@/lib/rbac/module-route-authorization';
import { buildDashboardSnapshot } from '@/lib/reporting/dashboard';
import {
  DEMO_COMPLAINTS,
  DEMO_DATA_NOTICE,
  DEMO_RECOMMENDATIONS,
} from '@/lib/reporting/demo-data';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const snapshot = buildDashboardSnapshot(
    DEMO_COMPLAINTS,
    DEMO_RECOMMENDATIONS,
    new Date('2026-08-31T00:00:00Z'),
  );
  const supabase = await createServerSupabaseClient();

  const checks = {
    hasPermission: async (permission: Parameters<typeof isPermissionAndClassificationAuthorized>[0]) => {
      if (!supabase) return false;
      const { data, error } = await supabase.rpc('has_permission', {
        permission_code: permission,
      });
      return !error && data === true;
    },
    hasCompartment: async (
      classification: Parameters<typeof isPermissionAndClassificationAuthorized>[1],
    ) => {
      if (!supabase) return false;
      const { data, error } = await supabase.rpc('has_compartment', {
        classification_code: classification,
      });
      return !error && data === true;
    },
  };

  const [
    canViewComplaints,
    canScreenComplaints,
    canViewInvestigations,
    canViewLeadership,
    canViewCompliance,
  ] = await Promise.all([
    isPermissionAndClassificationAuthorized('complaints.view', 'CONFIDENTIAL', checks),
    isPermissionAndClassificationAuthorized('complaints.screen', 'CONFIDENTIAL', checks),
    isPermissionAndClassificationAuthorized('investigations.view', 'CONFIDENTIAL', checks),
    isPermissionAndClassificationAuthorized(
      'leadership.view_restricted',
      'LEADERSHIP_RESTRICTED',
      checks,
    ),
    isPermissionAndClassificationAuthorized('compliance.view', 'CONFIDENTIAL', checks),
  ]);

  const workItems: { title: string; detail: string }[] = [];
  if (canScreenComplaints) {
    workItems.push({
      title: 'Complaint screening',
      detail: 'Review newly registered DEMO matters.',
    });
  }
  if (canViewInvestigations) {
    workItems.push({
      title: 'Investigation workload',
      detail: 'Review assigned DEMO investigation matters.',
    });
  }
  if (canViewLeadership) {
    workItems.push({
      title: 'Leadership review',
      detail: `${snapshot.leadershipMatters} restricted DEMO matter in workflow.`,
    });
  }
  if (canViewCompliance) {
    workItems.push({
      title: 'Compliance follow-up',
      detail: `${snapshot.recommendations.overdue} DEMO recommendation overdue.`,
    });
  }

  return (
    <>
      <header className="oc-page-head">
        <div>
          <h1>Executive Overview</h1>
          <p>Release 1 oversight dashboard limited to your authorised functions.</p>
        </div>
        <span className="oc-badge">DEMO MODE</span>
      </header>

      <div className="oc-notice">{DEMO_DATA_NOTICE}</div>

      {(canViewComplaints || canViewCompliance) && (
        <div className="oc-grid">
          {canViewComplaints && (
            <>
              <MetricCard label="Complaints" value={snapshot.complaintsTotal} />
              <MetricCard label="Open matters" value={snapshot.complaintsOpen} />
              <MetricCard label="Overdue matters" value={snapshot.complaintsOverdue} />
            </>
          )}
          {canViewCompliance && (
            <MetricCard
              label="Recommendation implementation"
              value={`${snapshot.recommendations.implementationRate}%`}
            />
          )}
        </div>
      )}

      <div className="oc-columns">
        {workItems.length > 0 ? (
          <WorkQueue items={workItems} />
        ) : (
          <div className="oc-card">
            <h3>Priority work queue</h3>
            <p>No DEMO work-queue items are authorised for this account.</p>
          </div>
        )}

        {canViewComplaints && (
          <div className="oc-card">
            <h3>Age profile — open complaints</h3>
            <ul className="oc-list">
              <li>Under 30 days: {snapshot.ageBands.under30}</li>
              <li>30–89 days: {snapshot.ageBands.days30to89}</li>
              <li>90+ days: {snapshot.ageBands.days90plus}</li>
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

import { notFound } from 'next/navigation';
import { AlertTable } from '@/components/operations/health/alert-table';
import { ThresholdForm } from '@/components/operations/health/threshold-form';
import { listHealthAlerts, listHealthThresholds, listLatestHealthMetrics } from '@/lib/operations/health/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function permissions() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const { data: canView, error } = await supabase.rpc('has_permission', { permission_code: 'system.health.view' });
  if (error || canView !== true) notFound();
  const { data: canManage } = await supabase.rpc('has_permission', { permission_code: 'system.health.manage' });
  return { canManage: canManage === true };
}

export default async function HealthAlertsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await permissions();
  const [alerts, thresholds, metrics, query] = await Promise.all([
    listHealthAlerts(),
    listHealthThresholds(),
    listLatestHealthMetrics(),
    searchParams,
  ]);
  const notice = typeof query.notice === 'string' ? query.notice : null;
  const error = typeof query.error === 'string' ? query.error : null;
  return <>
    <header className="oc-page-head"><div><h1>Health Alerts & Thresholds</h1><p>Review deterministic alerts and, where authorized, administer audited warning and critical thresholds.</p></div></header>
    {notice ? <p className="oc-card">{notice}</p> : null}
    {error ? <p className="oc-card" role="alert">{error}</p> : null}
    <AlertTable alerts={alerts} canManage={access.canManage} />
    {access.canManage ? <ThresholdForm metrics={metrics} thresholds={thresholds} /> : <section className="oc-card"><h2>Thresholds</h2><p>You have view-only System Health access.</p></section>}
  </>;
}

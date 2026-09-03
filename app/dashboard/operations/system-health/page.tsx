import { notFound } from 'next/navigation';
import { HealthStatusCard } from '@/components/operations/health/health-status-card';
import { MetricTable } from '@/components/operations/health/metric-table';
import { listLatestHealthMetrics } from '@/lib/operations/health/queries';
import type { HealthMetricDomain, HealthStatus } from '@/lib/operations/health/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function requireView() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const { data, error } = await supabase.rpc('has_permission', { permission_code: 'system.health.view' });
  if (error || data !== true) notFound();
}

const rank: Record<HealthStatus, number> = { HEALTHY: 1, UNKNOWN: 2, WARNING: 3, CRITICAL: 4 };
function domainStatus(metrics: Awaited<ReturnType<typeof listLatestHealthMetrics>>, domain: HealthMetricDomain): HealthStatus {
  const values = metrics.filter((metric) => metric.domain === domain);
  if (values.length === 0) return 'UNKNOWN';
  return values.reduce<HealthStatus>((current, metric) => rank[metric.status] > rank[current] ? metric.status : current, 'HEALTHY');
}

export default async function SystemHealthPage() {
  await requireView();
  const metrics = await listLatestHealthMetrics();
  const cards: Array<{ title: string; domain: HealthMetricDomain; href?: string }> = [
    { title: 'Application', domain: 'application' },
    { title: 'Database', domain: 'database', href: '/dashboard/operations/system-health/database' },
    { title: 'Storage', domain: 'storage', href: '/dashboard/operations/system-health/storage' },
    { title: 'Backup & Recovery', domain: 'backup', href: '/dashboard/operations/system-health/backups' },
    { title: 'Deployment', domain: 'deployment', href: '/dashboard/operations/system-health/deployment' },
    { title: 'Security', domain: 'security' },
  ];
  return <>
    <header className="oc-page-head"><div><h1>System Health</h1><p>Authorized operational telemetry, capacity, backup, deployment and security health. Missing or stale signals remain UNKNOWN.</p></div></header>
    <div className="oc-grid">{cards.map((card) => {
      const status = domainStatus(metrics, card.domain);
      const count = metrics.filter((metric) => metric.domain === card.domain).length;
      return <HealthStatusCard key={card.domain} title={card.title} status={status} summary={`${count} current normalized measurement${count === 1 ? '' : 's'}.`} href={card.href} />;
    })}</div>
    <h2>Latest normalized measurements</h2>
    <MetricTable metrics={metrics} />
  </>;
}

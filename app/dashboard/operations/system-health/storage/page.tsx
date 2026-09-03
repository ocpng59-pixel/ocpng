import { notFound } from 'next/navigation';
import { CapacityForecastCard } from '@/components/operations/health/capacity-forecast-card';
import { GrowthChart } from '@/components/operations/health/growth-chart';
import { MetricTable } from '@/components/operations/health/metric-table';
import { forecastCapacity } from '@/lib/operations/health/forecast';
import { listHealthMetricHistory, listLatestHealthMetrics } from '@/lib/operations/health/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function requireView() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const { data, error } = await supabase.rpc('has_permission', { permission_code: 'system.health.view' });
  if (error || data !== true) notFound();
}

export default async function StorageHealthPage() {
  await requireView();
  const [metrics, history] = await Promise.all([
    listLatestHealthMetrics('storage'),
    listHealthMetricHistory('storage.bytes', 90),
  ]);
  const forecast = forecastCapacity(history.map((point) => ({ observedAt: point.observedAt, value: point.numericValue })), new Date().toISOString());
  return <>
    <header className="oc-page-head"><div><h1>Storage Health</h1><p>Aggregate object count and capacity only. Protected object names and paths are never displayed.</p></div></header>
    <MetricTable metrics={metrics} />
    <GrowthChart title="Storage usage history" points={history} />
    <CapacityForecastCard title="Storage capacity forecast" forecast={forecast} />
  </>;
}

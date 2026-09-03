import { notFound } from 'next/navigation';
import { MetricTable } from '@/components/operations/health/metric-table';
import { listLatestHealthMetrics } from '@/lib/operations/health/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function requireView() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const { data, error } = await supabase.rpc('has_permission', { permission_code: 'system.health.view' });
  if (error || data !== true) notFound();
}

export default async function BackupHealthPage() {
  await requireView();
  const metrics = await listLatestHealthMetrics('backup');
  return <>
    <header className="oc-page-head"><div><h1>Backup Health</h1><p>Freshness of verified backups and completed restore rehearsals from WASDOK-55 operational metadata only.</p></div></header>
    <MetricTable metrics={metrics} />
  </>;
}

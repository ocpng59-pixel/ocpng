import { notFound } from 'next/navigation';
import { MetricTable } from '@/components/operations/health/metric-table';
import { listDeploymentHealth, listLatestHealthMetrics } from '@/lib/operations/health/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function requireView() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const { data, error } = await supabase.rpc('has_permission', { permission_code: 'system.health.view' });
  if (error || data !== true) notFound();
}

export default async function DeploymentHealthPage() {
  await requireView();
  const [metrics, deployments] = await Promise.all([
    listLatestHealthMetrics('deployment'),
    listDeploymentHealth(),
  ]);
  return <>
    <header className="oc-page-head"><div><h1>Deployment Health</h1><p>Authorized release identifiers and schema-drift status. No deployment credentials or environment secrets are exposed.</p></div></header>
    <MetricTable metrics={metrics} />
    <section className="oc-card"><h2>Deployment state</h2>{deployments.length === 0 ? <p>Deployment state is UNKNOWN.</p> : <table><thead><tr><th>Environment</th><th>Status</th><th>Release</th><th>Commit</th><th>Expected schema</th><th>Applied schema</th><th>Observed</th></tr></thead><tbody>{deployments.map((deployment) => <tr key={deployment.id}><td>{deployment.environment}</td><td><strong>{deployment.status}</strong></td><td>{deployment.releaseId ?? 'Unknown'}</td><td>{deployment.deployedCommit ?? 'Unknown'}</td><td>{deployment.expectedSchemaVersion ?? 'Unknown'}</td><td>{deployment.appliedSchemaVersion ?? 'Unknown'}</td><td>{new Date(deployment.observedAt).toLocaleString()}</td></tr>)}</tbody></table>}</section>
  </>;
}

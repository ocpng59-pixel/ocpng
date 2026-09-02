import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RestoreAuthorizationPanel } from '@/components/operations/backups/restore-authorization-panel';
import { RestoreRequestForm } from '@/components/operations/backups/restore-request-form';
import { listBackupJobs, listRecoveryPoints } from '@/lib/operations/backups/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function permissions() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const has = async (permission: string) => {
    const { data, error } = await supabase.rpc('has_permission', { permission_code: permission });
    return !error && data === true;
  };
  if (!(await has('backup.view'))) notFound();
  return {
    canRestoreTest: await has('backup.restore_test'),
    canRestoreProduction: await has('backup.restore_production'),
    canAuthorize: await has('backup.authorize_production_restore'),
  };
}

export default async function RestoreCentrePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await permissions();
  const [backups, recovery, query] = await Promise.all([listBackupJobs(), listRecoveryPoints(), searchParams]);
  const notice = typeof query.notice === 'string' ? query.notice : null;
  const error = typeof query.error === 'string' ? query.error : null;

  return <>
    <header className="oc-page-head"><div><h1>Restore Centre</h1><p>Run isolated restore rehearsals or request guarded production recovery. Production restore always requires a different authorized officer.</p></div><Link href="/dashboard/operations/backups">Back to Backup & Recovery</Link></header>
    {notice ? <p className="oc-card">{notice}</p> : null}
    {error ? <p className="oc-card" role="alert">{error}</p> : null}
    <section className="oc-card"><h2>Provider recovery coverage</h2><p>{recovery.enabled ? `${recovery.points.length} recovery point(s) currently recorded.` : 'No provider recovery points are currently recorded.'}</p><p>Earliest: {recovery.earliestRecoveryTime ?? 'unknown'} · Latest: {recovery.latestRecoveryTime ?? 'unknown'}</p></section>
    <RestoreRequestForm backups={backups} recovery={recovery} canRestoreTest={access.canRestoreTest} canRestoreProduction={access.canRestoreProduction} />
    <RestoreAuthorizationPanel canAuthorize={access.canAuthorize} />
  </>;
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BackupHistoryTable } from '@/components/operations/backups/backup-history-table';
import { BackupRequestForm } from '@/components/operations/backups/backup-request-form';
import { BackupScheduleForm } from '@/components/operations/backups/backup-schedule-form';
import { BackupStatusCard } from '@/components/operations/backups/backup-status-card';
import { RetentionPolicyForm } from '@/components/operations/backups/retention-policy-form';
import {
  listBackupJobs,
  listBackupSchedules,
  listRetentionPolicies,
} from '@/lib/operations/backups/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function permissions() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const has = async (permission: string) => {
    const { data, error } = await supabase.rpc('has_permission', { permission_code: permission });
    return !error && data === true;
  };
  const canView = await has('backup.view');
  if (!canView) notFound();
  return {
    canCreate: await has('backup.create'),
    canSchedule: await has('backup.schedule'),
    canRetention: await has('backup.manage_retention'),
    canRestoreTest: await has('backup.restore_test'),
    canRestoreProduction: await has('backup.restore_production'),
  };
}

export default async function BackupRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await permissions();
  const [jobs, schedules, policies, query] = await Promise.all([
    listBackupJobs(), listBackupSchedules(), listRetentionPolicies(), searchParams,
  ]);
  const notice = typeof query.notice === 'string' ? query.notice : null;
  const error = typeof query.error === 'string' ? query.error : null;

  return <>
    <header className="oc-page-head"><div><h1>Backup & Recovery</h1><p>Manage verified archival backups, schedules, retention and controlled recovery operations.</p></div>
      <Link className="oc-button" href="/dashboard/operations/backups/restore">Restore Centre</Link>
    </header>
    {notice ? <p className="oc-card">{notice}</p> : null}
    {error ? <p className="oc-card" role="alert">{error}</p> : null}
    <BackupStatusCard jobs={jobs} />
    {access.canCreate ? <BackupRequestForm /> : null}
    <BackupHistoryTable jobs={jobs} />
    <section className="oc-card"><h2>Schedules</h2>{schedules.length === 0 ? <p>No schedules configured.</p> : <ul>{schedules.map((schedule) => <li key={schedule.id}>{schedule.backupType} · {schedule.cadence} · {schedule.enabled ? 'Enabled' : 'Disabled'}</li>)}</ul>}</section>
    {access.canSchedule ? <BackupScheduleForm policies={policies} /> : null}
    <section className="oc-card"><h2>Retention</h2>{policies.length === 0 ? <p>No retention policies configured.</p> : <ul>{policies.map((policy) => <li key={policy.id}>{policy.name}: {policy.retentionDays} days · purge {policy.purgeEnabled ? 'enabled' : 'disabled'}</li>)}</ul>}</section>
    {access.canRetention ? <RetentionPolicyForm /> : null}
    {(access.canRestoreTest || access.canRestoreProduction) ? <p><Link href="/dashboard/operations/backups/restore">Open Restore Centre</Link></p> : null}
  </>;
}

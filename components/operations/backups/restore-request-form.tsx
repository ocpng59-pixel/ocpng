import {
  requestProductionRestoreAction,
  requestRestoreTestAction,
} from '@/app/dashboard/operations/backups/actions';
import type { BackupJobSummary } from '@/lib/operations/backups/queries';
import type { ProviderRecoveryStatus } from '@/lib/operations/backups/types';

export function RestoreRequestForm({
  backups,
  recovery,
  canRestoreTest,
  canRestoreProduction,
}: {
  backups: BackupJobSummary[];
  recovery: ProviderRecoveryStatus;
  canRestoreTest: boolean;
  canRestoreProduction: boolean;
}) {
  return <div className="oc-grid-two">
    {canRestoreTest ? <form action={requestRestoreTestAction} className="oc-card oc-stack">
      <h2>Restore rehearsal</h2>
      <p>Restores into an isolated test environment only.</p>
      <label>Verified backup<select name="backupId" required defaultValue=""><option value="" disabled>Select backup</option>{backups.filter((backup) => backup.status === 'AVAILABLE').map((backup) => <option key={backup.id} value={backup.id}>{backup.backupCode}</option>)}</select></label>
      <label>Reason<textarea name="reason" minLength={3} maxLength={500} required /></label>
      <button type="submit">Request restore test</button>
    </form> : null}

    {canRestoreProduction ? <form action={requestProductionRestoreAction} className="oc-card oc-stack">
      <h2>Production restore request</h2>
      <p>This does not execute a restore. A different authorized officer must approve it.</p>
      <label>Recovery point<select name="recoveryRef" required defaultValue=""><option value="" disabled>Select recovery point</option>{recovery.points.map((point) => <option key={point.reference} value={point.reference}>{point.kind} · {point.recoveryTime ?? 'provider point'}</option>)}</select></label>
      <label>Recovery time<input name="recoveryTime" type="datetime-local" required /></label>
      <label>Reason<textarea name="reason" minLength={3} maxLength={500} required /></label>
      <button type="submit">Request production restore</button>
    </form> : null}
  </div>;
}

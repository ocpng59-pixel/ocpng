import { requestBackupAction } from '@/app/dashboard/operations/backups/actions';

export function BackupRequestForm() {
  return <form action={requestBackupAction} className="oc-card oc-stack">
    <h2>Create backup</h2>
    <label>Backup type<select name="backupType" defaultValue="FULL_ARCHIVE">
      <option value="FULL_ARCHIVE">Full archival backup</option>
      <option value="STORAGE_INCREMENT">Storage increment</option>
      <option value="PRE_RELEASE">Pre-release backup</option>
      <option value="PRE_MIGRATION">Pre-migration backup</option>
    </select></label>
    <label>Administrative reason<textarea name="reason" minLength={3} maxLength={500} required /></label>
    <button type="submit">Create backup request</button>
  </form>;
}

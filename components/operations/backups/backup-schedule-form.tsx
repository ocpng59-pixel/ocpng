import { upsertBackupScheduleAction } from '@/app/dashboard/operations/backups/actions';
import type { RetentionPolicyView } from '@/lib/operations/backups/queries';

export function BackupScheduleForm({ policies }: { policies: RetentionPolicyView[] }) {
  return <form action={upsertBackupScheduleAction} className="oc-card oc-stack">
    <h2>Backup schedule</h2>
    <label>Backup type<select name="backupType" defaultValue="FULL_ARCHIVE">
      <option value="FULL_ARCHIVE">Full archive</option><option value="STORAGE_INCREMENT">Storage increment</option>
      <option value="PRE_RELEASE">Pre-release</option><option value="PRE_MIGRATION">Pre-migration</option>
    </select></label>
    <label>Cadence<input name="cadence" placeholder="0 1 * * 0" required /></label>
    <label>Retention policy<select name="retentionPolicyId" defaultValue=""><option value="">None</option>{policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}</select></label>
    <label>Enabled<select name="enabled" defaultValue="true"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
    <label>Administrative reason<textarea name="reason" minLength={3} maxLength={500} required /></label>
    <button type="submit">Save schedule</button>
  </form>;
}

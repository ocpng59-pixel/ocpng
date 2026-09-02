import { upsertRetentionPolicyAction } from '@/app/dashboard/operations/backups/actions';

export function RetentionPolicyForm() {
  return <form action={upsertRetentionPolicyAction} className="oc-card oc-stack">
    <h2>Retention policy</h2>
    <label>Name<input name="name" maxLength={120} required /></label>
    <label>Retention days<input name="retentionDays" type="number" min={1} max={3650} defaultValue={90} required /></label>
    <label>Purge behavior<select name="purgeEnabled" defaultValue="false"><option value="false">Archive only</option><option value="true">Allow scheduled purge after expiry</option></select></label>
    <label>Administrative reason<textarea name="reason" minLength={3} maxLength={500} required /></label>
    <button type="submit">Save retention policy</button>
  </form>;
}

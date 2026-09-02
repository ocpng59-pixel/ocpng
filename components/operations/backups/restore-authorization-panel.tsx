import { authorizeProductionRestoreAction } from '@/app/dashboard/operations/backups/actions';
import type { RestoreRunView } from '@/lib/operations/backups/queries';

export function RestoreAuthorizationPanel({
  canAuthorize,
  restoreRuns,
}: {
  canAuthorize: boolean;
  restoreRuns: RestoreRunView[];
}) {
  if (!canAuthorize) return null;
  const pending = restoreRuns.filter((run) =>
    run.restoreType === 'PRODUCTION' && ['IMPACT_REVIEW', 'AWAITING_AUTHORIZATION'].includes(run.status));

  return <form action={authorizeProductionRestoreAction} className="oc-card oc-stack">
    <h2>Independent production-restore authorization</h2>
    <p>The authorizer must be a different user from the officer who requested the production restore. The database enforces this separation.</p>
    <label>Pending restore request<select name="restoreId" required defaultValue="">
      <option value="" disabled>Select request</option>
      {pending.map((run) => <option key={run.id} value={run.id}>{run.id} · {run.requestedRecoveryTime ?? 'provider recovery point'} · {run.status}</option>)}
    </select></label>
    {pending.length === 0 ? <p>No production restore is awaiting authorization.</p> : null}
    <label>Authorization reason<textarea name="reason" minLength={3} maxLength={500} required /></label>
    <button type="submit" disabled={pending.length === 0}>Authorize production restore</button>
  </form>;
}

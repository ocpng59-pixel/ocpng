import { authorizeProductionRestoreAction } from '@/app/dashboard/operations/backups/actions';

export function RestoreAuthorizationPanel({ canAuthorize }: { canAuthorize: boolean }) {
  if (!canAuthorize) return null;
  return <form action={authorizeProductionRestoreAction} className="oc-card oc-stack">
    <h2>Independent production-restore authorization</h2>
    <p>The authorizer must be a different user from the officer who requested the production restore. The database enforces this separation.</p>
    <label>Restore request ID<input name="restoreId" placeholder="UUID" required /></label>
    <label>Authorization reason<textarea name="reason" minLength={3} maxLength={500} required /></label>
    <button type="submit">Authorize production restore</button>
  </form>;
}

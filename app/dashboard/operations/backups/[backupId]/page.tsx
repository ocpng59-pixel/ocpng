import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requestDownloadAction } from '@/app/dashboard/operations/backups/actions';
import { getBackupDetail } from '@/lib/operations/backups/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function access() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  const check = async (permission: string) => {
    const { data, error } = await supabase.rpc('has_permission', { permission_code: permission });
    return !error && data === true;
  };
  if (!(await check('backup.view'))) notFound();
  return { canDownload: await check('backup.download') };
}

export default async function BackupDetailPage({ params }: { params: Promise<{ backupId: string }> }) {
  const permissions = await access();
  const { backupId } = await params;
  const backup = await getBackupDetail(backupId);
  if (!backup) notFound();

  return <>
    <header className="oc-page-head"><div><h1>{backup.backupCode}</h1><p>{backup.backupType} · {backup.environment} · {backup.status}</p></div><Link href="/dashboard/operations/backups">Back to Backup & Recovery</Link></header>
    <section className="oc-card"><h2>Lifecycle</h2><dl>
      <dt>Requested</dt><dd>{new Date(backup.requestedAt).toLocaleString()}</dd>
      <dt>Completed</dt><dd>{backup.completedAt ? new Date(backup.completedAt).toLocaleString() : 'Not completed'}</dd>
      <dt>Verified</dt><dd>{backup.verifiedAt ? new Date(backup.verifiedAt).toLocaleString() : 'Not verified'}</dd>
      <dt>Reason</dt><dd>{backup.requestReason}</dd>
    </dl></section>
    <section className="oc-card"><h2>Artifacts</h2>{backup.artifacts.length === 0 ? <p>No archive artifact recorded.</p> : backup.artifacts.map((artifact) => <article key={artifact.id}><p><strong>{artifact.artifactType}</strong> · {artifact.byteSize ?? 0} bytes · {artifact.encryptionAlgorithm ?? 'encryption pending'}</p><p>SHA-256: <code>{artifact.archiveChecksum ?? 'pending'}</code></p><p>Recovery domains: <code>{JSON.stringify(artifact.recoveryDomains)}</code></p></article>)}</section>
    <section className="oc-card"><h2>Verification</h2>{backup.verifications.length === 0 ? <p>No verification result recorded.</p> : <ul>{backup.verifications.map((verification) => <li key={verification.id}>{verification.status} · {verification.verificationVersion} · {verification.verifiedAt ?? 'pending'}</li>)}</ul>}</section>
    {permissions.canDownload && backup.status === 'AVAILABLE' ? <form action={requestDownloadAction} className="oc-card oc-stack"><h2>Download encrypted archive</h2><input type="hidden" name="backupId" value={backup.id} /><label>Administrative reason<textarea name="reason" minLength={3} maxLength={500} required /></label><button type="submit">Generate secure download</button><p>The signed link is short-lived and is not stored in the database.</p></form> : null}
  </>;
}

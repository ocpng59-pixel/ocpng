import type { BackupJobSummary } from '@/lib/operations/backups/queries';

export function BackupStatusCard({ jobs }: { jobs: BackupJobSummary[] }) {
  const latest = jobs[0];
  const healthy = latest?.status === 'AVAILABLE';
  return <section className="oc-card">
    <h2>Backup status</h2>
    <p><strong>{latest ? (healthy ? 'HEALTHY' : latest.status) : 'NO BACKUP HISTORY'}</strong></p>
    {latest ? <p>Latest: {latest.backupCode} · {latest.backupType} · {new Date(latest.requestedAt).toLocaleString()}</p> : null}
  </section>;
}

import Link from 'next/link';
import type { BackupJobSummary } from '@/lib/operations/backups/queries';

export function BackupHistoryTable({ jobs }: { jobs: BackupJobSummary[] }) {
  return <section className="oc-card"><h2>Backup history</h2>
    <div className="oc-table-wrap"><table><thead><tr><th>Backup</th><th>Type</th><th>Status</th><th>Requested</th><th>Environment</th></tr></thead>
      <tbody>{jobs.map((job) => <tr key={job.id}>
        <td><Link href={`/dashboard/operations/backups/${job.id}`}>{job.backupCode}</Link></td>
        <td>{job.backupType}</td><td>{job.status}</td><td>{new Date(job.requestedAt).toLocaleString()}</td><td>{job.environment}</td>
      </tr>)}</tbody></table></div>
    {jobs.length === 0 ? <p>No backup jobs have been recorded.</p> : null}
  </section>;
}

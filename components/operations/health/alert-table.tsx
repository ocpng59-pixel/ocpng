import { acknowledgeHealthAlertAction } from '@/app/dashboard/operations/system-health/actions';
import type { HealthAlertView } from '@/lib/operations/health/queries';

export function AlertTable({ alerts, canManage }: { alerts: HealthAlertView[]; canManage: boolean }) {
  if (alerts.length === 0) return <p>No health alerts are recorded.</p>;
  return <div className="oc-card">
    <table>
      <thead><tr><th>Metric</th><th>Severity</th><th>Status</th><th>Current</th><th>Opened</th><th>Source</th><th>Reason</th><th>Action</th></tr></thead>
      <tbody>{alerts.map((alert) => <tr key={alert.id}>
        <td>{alert.metricCode}</td><td><strong>{alert.severity}</strong></td><td>{alert.status}</td>
        <td>{alert.currentValue ?? 'Unknown'}</td><td>{new Date(alert.openedAt).toLocaleString()}</td>
        <td>{alert.source}{alert.provider ? ` / ${alert.provider}` : ''}</td><td>{alert.reason}</td>
        <td>{canManage && alert.status === 'OPEN' ? <form action={acknowledgeHealthAlertAction}>
          <input type="hidden" name="alertId" value={alert.id} />
          <label>Reason<input name="reason" minLength={3} maxLength={500} required /></label>
          <button type="submit">Acknowledge</button>
        </form> : '—'}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

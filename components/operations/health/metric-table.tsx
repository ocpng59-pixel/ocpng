import type { HealthMetricView } from '@/lib/operations/health/queries';

function formatValue(value: number, unit: string): string {
  if (unit === 'bytes') return `${(value / 1_048_576).toLocaleString(undefined, { maximumFractionDigits: 2 })} MiB`;
  if (unit === 'ratio') return `${(value * 100).toFixed(2)}%`;
  if (unit === 'ms') return `${value.toLocaleString()} ms`;
  if (unit === 'seconds') return `${value.toLocaleString()} s`;
  if (unit === 'bool') return value === 1 ? 'Yes' : 'No';
  return value.toLocaleString();
}

export function MetricTable({ metrics }: { metrics: HealthMetricView[] }) {
  if (metrics.length === 0) return <p>No current normalized health measurements are available.</p>;
  return <div className="oc-card">
    <table>
      <thead><tr><th>Metric</th><th>Measurement</th><th>Status</th><th>Observed</th><th>Source</th><th>Reason</th></tr></thead>
      <tbody>{metrics.map((metric) => {
        const { numericValue, unit, observedAt, source, reason } = metric;
        return <tr key={metric.metricCode}>
          <td><strong>{metric.name}</strong><br /><small>{metric.metricCode}</small></td>
          <td>{formatValue(numericValue, unit)} <small>({unit})</small></td>
          <td><strong>{metric.status}</strong></td>
          <td>{observedAt ? new Date(observedAt).toLocaleString() : 'Unknown'}</td>
          <td>{source}{metric.provider ? ` / ${metric.provider}` : ''}</td>
          <td>{reason ?? 'No additional reason supplied.'}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

import type { HealthHistoryPoint } from '@/lib/operations/health/queries';

function display(value: number, unit: string): string {
  if (unit === 'bytes') return `${(value / 1_048_576).toLocaleString(undefined, { maximumFractionDigits: 2 })} MiB`;
  return value.toLocaleString();
}

export function GrowthChart({ title, points }: { title: string; points: HealthHistoryPoint[] }) {
  const recent = points.slice(-30);
  const max = Math.max(1, ...recent.map((point) => point.numericValue));
  return <section className="oc-card">
    <h2>{title}</h2>
    {recent.length === 0 ? <p>Insufficient historical data.</p> : <>
      <div aria-hidden="true">{recent.map((point) => {
        const observedAt = point.observedAt;
        const value = point.numericValue;
        return <div key={`${observedAt}-${value}`} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBlock: '0.25rem' }}>
          <span style={{ minWidth: '7rem' }}>{new Date(observedAt).toLocaleDateString()}</span>
          <span style={{ display: 'inline-block', height: '0.75rem', width: `${Math.max(2, (value / max) * 100)}%`, background: 'currentColor', opacity: 0.35 }} />
        </div>;
      })}</div>
      <table>
        <thead><tr><th>Observed</th><th>Value</th><th>Status</th></tr></thead>
        <tbody>{recent.map((point) => {
          const observedAt = point.observedAt;
          const value = point.numericValue;
          return <tr key={`${observedAt}-${value}-row`}><td>{new Date(observedAt).toLocaleString()}</td><td>{display(value, point.unit)}</td><td>{point.status}</td></tr>;
        })}</tbody>
      </table>
    </>}
  </section>;
}

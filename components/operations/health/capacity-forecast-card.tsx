import type { CapacityForecast } from '@/lib/operations/health/types';

function bytes(value: number | null): string {
  if (value === null) return 'Unavailable';
  return `${(value / 1_073_741_824).toLocaleString(undefined, { maximumFractionDigits: 2 })} GiB`;
}

export function CapacityForecastCard({ title, forecast }: { title: string; forecast: CapacityForecast }) {
  return <section className="oc-card">
    <h2>{title}</h2>
    {forecast.status === 'INSUFFICIENT_DATA' ? <p>INSUFFICIENT DATA — at least seven distinct observation days are required. Samples available: {forecast.sampleCount}.</p> : <>
      <p>Deterministic trend: {forecast.slopePerDay?.toLocaleString(undefined, { maximumFractionDigits: 2 })} bytes/day from {forecast.sampleCount} daily samples.</p>
      <ul>
        <li>30 days: {bytes(forecast.projected30Days)}</li>
        <li>180 days: {bytes(forecast.projected180Days)}</li>
        <li>365 days: {bytes(forecast.projected365Days)}</li>
      </ul>
    </>}
  </section>;
}

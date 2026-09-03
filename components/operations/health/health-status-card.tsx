import Link from 'next/link';
import type { HealthStatus } from '@/lib/operations/health/types';

const labels: Record<HealthStatus, string> = {
  HEALTHY: 'HEALTHY',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
  UNKNOWN: 'UNKNOWN',
};

export function HealthStatusCard({
  title,
  status,
  summary,
  href,
}: {
  title: string;
  status: HealthStatus;
  summary: string;
  href?: string;
}) {
  return <section className="oc-card" data-health-status={status}>
    <h2>{title}</h2>
    <p><strong>{labels[status]}</strong></p>
    <p>{summary}</p>
    {status === 'UNKNOWN' ? <p>Current telemetry is unavailable, missing or stale. UNKNOWN is not treated as healthy.</p> : null}
    {href ? <p><Link href={href}>View details</Link></p> : null}
  </section>;
}

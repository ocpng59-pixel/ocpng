import type { HealthMetricDefinition } from '@/lib/operations/health/types';

export const HEALTH_METRIC_CATALOG = [
  { code: 'app.availability', domain: 'application', unit: 'bool', valueType: 'BOOLEAN', source: 'application', provider: 'wasdok', staleAfterSeconds: 300 },
  { code: 'app.response_latency_ms', domain: 'application', unit: 'ms', valueType: 'GAUGE', source: 'application', provider: 'wasdok', staleAfterSeconds: 300 },
  { code: 'app.http_error_rate', domain: 'application', unit: 'ratio', valueType: 'RATIO', source: 'application', provider: 'netlify', staleAfterSeconds: 300 },
  { code: 'db.database_bytes', domain: 'database', unit: 'bytes', valueType: 'GAUGE', source: 'database', provider: 'supabase', staleAfterSeconds: 900 },
  { code: 'db.disk_bytes', domain: 'database', unit: 'bytes', valueType: 'GAUGE', source: 'database', provider: 'supabase', staleAfterSeconds: 900 },
  { code: 'db.wal_bytes', domain: 'database', unit: 'bytes', valueType: 'GAUGE', source: 'database', provider: 'supabase', staleAfterSeconds: 900 },
  { code: 'db.connections_active', domain: 'database', unit: 'count', valueType: 'GAUGE', source: 'database', provider: 'supabase', staleAfterSeconds: 300 },
  { code: 'db.connections_max', domain: 'database', unit: 'count', valueType: 'GAUGE', source: 'database', provider: 'supabase', staleAfterSeconds: 3600 },
  { code: 'db.long_running_queries', domain: 'database', unit: 'count', valueType: 'GAUGE', source: 'database', provider: 'supabase', staleAfterSeconds: 300 },
  { code: 'db.deadlocks_24h', domain: 'database', unit: 'count', valueType: 'COUNTER', source: 'database', provider: 'supabase', staleAfterSeconds: 1800 },
  { code: 'storage.object_count', domain: 'storage', unit: 'count', valueType: 'GAUGE', source: 'storage', provider: 'supabase', staleAfterSeconds: 1800 },
  { code: 'storage.bytes', domain: 'storage', unit: 'bytes', valueType: 'GAUGE', source: 'storage', provider: 'supabase', staleAfterSeconds: 1800 },
  { code: 'backup.last_verified_age_seconds', domain: 'backup', unit: 'seconds', valueType: 'GAUGE', source: 'backup', provider: 'wasdok', staleAfterSeconds: 1800 },
  { code: 'backup.last_restore_rehearsal_age_seconds', domain: 'backup', unit: 'seconds', valueType: 'GAUGE', source: 'backup', provider: 'wasdok', staleAfterSeconds: 3600 },
  { code: 'deployment.schema_drift', domain: 'deployment', unit: 'bool', valueType: 'BOOLEAN', source: 'deployment', provider: 'wasdok', staleAfterSeconds: 300 },
  { code: 'security.failed_privileged_ops_24h', domain: 'security', unit: 'count', valueType: 'COUNTER', source: 'security', provider: 'wasdok', staleAfterSeconds: 1800 },
  { code: 'security.failed_logins_24h', domain: 'security', unit: 'count', valueType: 'COUNTER', source: 'security', provider: 'supabase', staleAfterSeconds: 1800 },
  { code: 'security.advisor_warning_count', domain: 'security', unit: 'count', valueType: 'GAUGE', source: 'security', provider: 'supabase', staleAfterSeconds: 3600 },
] as const satisfies readonly HealthMetricDefinition[];

const CATALOG_BY_CODE = new Map<string, HealthMetricDefinition>(
  HEALTH_METRIC_CATALOG.map((definition) => [definition.code, definition]),
);

export function getHealthMetricDefinition(code: string): HealthMetricDefinition | null {
  return CATALOG_BY_CODE.get(code) ?? null;
}

export function isKnownHealthMetricCode(code: string): boolean {
  return CATALOG_BY_CODE.has(code);
}

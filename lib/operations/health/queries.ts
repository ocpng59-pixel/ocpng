import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { HealthMetricDomain, HealthStatus, ThresholdDirection } from './types';

export type HealthMetricView = {
  metricCode: string;
  domain: HealthMetricDomain;
  name: string;
  unit: string;
  numericValue: number;
  status: HealthStatus;
  reason: string | null;
  source: string;
  provider: string;
  observedAt: string;
  collectedAt: string;
  staleAfterSeconds: number;
};

export type HealthHistoryPoint = {
  metricCode: string;
  unit: string;
  numericValue: number;
  status: HealthStatus;
  reason: string | null;
  source: string;
  provider: string;
  observedAt: string;
  collectedAt: string;
};

export type HealthThresholdView = {
  id: string;
  metricCode: string;
  warningValue: number;
  criticalValue: number;
  direction: ThresholdDirection;
  isActive: boolean;
  updatedAt: string;
};

export type HealthAlertView = {
  id: string;
  metricCode: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  severity: HealthStatus;
  currentValue: number | null;
  reason: string;
  source: string;
  provider: string;
  openedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  updatedAt: string;
};

export type DeploymentHealthView = {
  id: string;
  environment: string;
  deployedCommit: string | null;
  releaseId: string | null;
  expectedSchemaVersion: string | null;
  appliedSchemaVersion: string | null;
  status: HealthStatus;
  source: string;
  provider: string;
  observedAt: string;
  collectedAt: string;
  updatedAt: string;
};

type Row = Record<string, unknown>;

async function client() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error('System Health is unavailable.');
  return supabase;
}

function text(row: Row, key: string): string {
  return typeof row[key] === 'string' ? row[key] as string : '';
}

function nullableText(row: Row, key: string): string | null {
  return typeof row[key] === 'string' ? row[key] as string : null;
}

function numeric(row: Row, key: string): number {
  const value = row[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function mapMetric(row: Row): HealthMetricView {
  return {
    metricCode: text(row, 'metric_code'),
    domain: text(row, 'domain') as HealthMetricDomain,
    name: text(row, 'name'),
    unit: text(row, 'unit'),
    numericValue: numeric(row, 'numeric_value'),
    status: text(row, 'status') as HealthStatus,
    reason: nullableText(row, 'reason'),
    source: text(row, 'source'),
    provider: text(row, 'provider'),
    observedAt: text(row, 'observed_at'),
    collectedAt: text(row, 'collected_at'),
    staleAfterSeconds: numeric(row, 'stale_after_seconds'),
  };
}

export async function listLatestHealthMetrics(domain?: HealthMetricDomain): Promise<HealthMetricView[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc('read_system_health_latest_metrics', {
    p_domain: domain ?? null,
  });
  if (error) return [];
  return ((data ?? []) as Row[]).map(mapMetric);
}

export async function listHealthMetricHistory(metricCode: string, days = 90): Promise<HealthHistoryPoint[]> {
  if (!/^(db\.database_bytes|storage\.bytes)$/.test(metricCode)) return [];
  const supabase = await client();
  const { data, error } = await supabase.rpc('read_system_health_metric_history', {
    p_metric_code: metricCode,
    p_days: Math.max(1, Math.min(90, Math.trunc(days))),
  });
  if (error) return [];
  return ((data ?? []) as Row[]).map((row) => ({
    metricCode: text(row, 'metric_code'),
    unit: text(row, 'unit'),
    numericValue: numeric(row, 'numeric_value'),
    status: text(row, 'status') as HealthStatus,
    reason: nullableText(row, 'reason'),
    source: text(row, 'source'),
    provider: text(row, 'provider'),
    observedAt: text(row, 'observed_at'),
    collectedAt: text(row, 'collected_at'),
  }));
}

export async function listHealthThresholds(): Promise<HealthThresholdView[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc('read_system_health_thresholds');
  if (error) return [];
  return ((data ?? []) as Row[]).map((row) => ({
    id: text(row, 'id'),
    metricCode: text(row, 'metric_code'),
    warningValue: numeric(row, 'warning_value'),
    criticalValue: numeric(row, 'critical_value'),
    direction: text(row, 'direction') as ThresholdDirection,
    isActive: row.is_active === true,
    updatedAt: text(row, 'updated_at'),
  }));
}

export async function listHealthAlerts(status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'): Promise<HealthAlertView[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc('read_system_health_alerts', { p_status: status ?? null });
  if (error) return [];
  return ((data ?? []) as Row[]).map((row) => ({
    id: text(row, 'id'),
    metricCode: text(row, 'metric_code'),
    status: text(row, 'status') as HealthAlertView['status'],
    severity: text(row, 'severity') as HealthStatus,
    currentValue: row.current_value === null || row.current_value === undefined ? null : numeric(row, 'current_value'),
    reason: text(row, 'reason'),
    source: text(row, 'source'),
    provider: text(row, 'provider'),
    openedAt: text(row, 'opened_at'),
    acknowledgedAt: nullableText(row, 'acknowledged_at'),
    resolvedAt: nullableText(row, 'resolved_at'),
    updatedAt: text(row, 'updated_at'),
  }));
}

export async function listDeploymentHealth(): Promise<DeploymentHealthView[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc('read_deployment_health_state');
  if (error) return [];
  return ((data ?? []) as Row[]).map((row) => ({
    id: text(row, 'id'),
    environment: text(row, 'environment'),
    deployedCommit: nullableText(row, 'deployed_commit'),
    releaseId: nullableText(row, 'release_id'),
    expectedSchemaVersion: nullableText(row, 'expected_schema_version'),
    appliedSchemaVersion: nullableText(row, 'applied_schema_version'),
    status: text(row, 'status') as HealthStatus,
    source: text(row, 'source'),
    provider: text(row, 'provider'),
    observedAt: text(row, 'observed_at'),
    collectedAt: text(row, 'collected_at'),
    updatedAt: text(row, 'updated_at'),
  }));
}

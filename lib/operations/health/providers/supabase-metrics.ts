import 'server-only';

import type {
  HealthMetricsProvider,
  HealthProviderMetric,
  HealthProviderSnapshot,
} from '@/lib/operations/health/provider-types';

const MANAGEMENT_API_ROOT = 'https://api.supabase.com/v1/projects';
const DEFAULT_TIMEOUT_MS = 10_000;
const MB = 1024 * 1024;

type FetchLike = typeof fetch;

type Input = {
  projectRef: string;
  healthToken: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

function unknown(reason: NonNullable<HealthProviderSnapshot['reason']>): HealthProviderSnapshot {
  return {
    source: 'supabase-management-metrics',
    status: 'UNKNOWN',
    metrics: [],
    reason,
  };
}

function mapFailure(status: number): HealthProviderSnapshot {
  if (status === 401) return unknown('AUTHENTICATION_FAILED');
  if (status === 403) return unknown('AUTHORIZATION_FAILED');
  if (status === 429) return unknown('RATE_LIMITED');
  if (status >= 500) return unknown('PROVIDER_UNAVAILABLE');
  return unknown('PROVIDER_ERROR');
}

function parsePrometheusLine(line: string): { name: string; value: number } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const match = /^([A-Za-z_:][A-Za-z0-9_:]*)(?:\{[^}]*\})?\s+([^\s]+)(?:\s+\d+)?$/.exec(trimmed);
  if (!match) return null;

  const value = Number(match[2]);
  if (!Number.isFinite(value)) return null;
  return { name: match[1], value };
}

export function parseSupabasePrometheusMetrics(text: string): HealthProviderMetric[] {
  let databaseBytes: number | null = null;
  let connectionsActive = 0;
  let sawConnections = false;

  for (const line of text.split(/\r?\n/)) {
    const parsed = parsePrometheusLine(line);
    if (!parsed) continue;

    if (parsed.name === 'pg_database_size_mb' && parsed.value >= 0) {
      databaseBytes = Math.max(databaseBytes ?? 0, parsed.value * MB);
    } else if (parsed.name === 'pg_stat_database_num_backends' && parsed.value >= 0) {
      connectionsActive += parsed.value;
      sawConnections = true;
    }
  }

  const metrics: HealthProviderMetric[] = [];
  if (databaseBytes !== null) metrics.push({ code: 'db.database_bytes', value: databaseBytes });
  if (sawConnections) metrics.push({ code: 'db.connections_active', value: connectionsActive });
  return metrics;
}

export class SupabaseMetricsProvider implements HealthMetricsProvider {
  private readonly projectRef: string;
  private readonly healthToken: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(input: Input) {
    this.projectRef = input.projectRef;
    this.healthToken = input.healthToken;
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async collect(): Promise<HealthProviderSnapshot> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(
        `${MANAGEMENT_API_ROOT}/${this.projectRef}/analytics/endpoints/metrics`,
        {
          method: 'GET',
          headers: {
            authorization: `Bearer ${this.healthToken}`,
            accept: 'text/plain; version=0.0.4',
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) return mapFailure(response.status);

      const metrics = parseSupabasePrometheusMetrics(await response.text());
      return {
        source: 'supabase-management-metrics',
        status: 'AVAILABLE',
        metrics,
      };
    } catch {
      return unknown('PROVIDER_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
  }
}

const MANAGEMENT_API_ROOT = 'https://api.supabase.com/v1/projects';
const DEFAULT_TIMEOUT_MS = 10_000;
const MB = 1024 * 1024;

function unknown(reason) {
  return {
    source: 'supabase-management-metrics',
    status: 'UNKNOWN',
    metrics: [],
    reason,
  };
}

function mapFailure(status) {
  if (status === 401) return unknown('AUTHENTICATION_FAILED');
  if (status === 403) return unknown('AUTHORIZATION_FAILED');
  if (status === 429) return unknown('RATE_LIMITED');
  if (status >= 500) return unknown('PROVIDER_UNAVAILABLE');
  return unknown('PROVIDER_ERROR');
}

function parsePrometheusLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const match = /^([A-Za-z_:][A-Za-z0-9_:]*)(?:\{[^}]*\})?\s+([^\s]+)(?:\s+\d+)?$/.exec(trimmed);
  if (!match) return null;

  const value = Number(match[2]);
  if (!Number.isFinite(value)) return null;
  return { name: match[1], value };
}

export function parseSupabasePrometheusMetrics(text) {
  let databaseBytes = null;
  let connectionsActive = 0;
  let sawConnections = false;

  for (const line of String(text).split(/\r?\n/)) {
    const parsed = parsePrometheusLine(line);
    if (!parsed) continue;

    if (parsed.name === 'pg_database_size_mb' && parsed.value >= 0) {
      databaseBytes = Math.max(databaseBytes ?? 0, parsed.value * MB);
    } else if (parsed.name === 'pg_stat_database_num_backends' && parsed.value >= 0) {
      connectionsActive += parsed.value;
      sawConnections = true;
    }
  }

  const metrics = [];
  if (databaseBytes !== null) metrics.push({ code: 'db.database_bytes', value: databaseBytes });
  if (sawConnections) metrics.push({ code: 'db.connections_active', value: connectionsActive });
  return metrics;
}

export class SupabaseMetricsProvider {
  constructor(input) {
    this.projectRef = input.projectRef;
    this.healthToken = input.healthToken;
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async collect() {
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

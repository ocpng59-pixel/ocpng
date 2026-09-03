export type HealthProviderMetric = { code: string; value: number };
export type HealthProviderSnapshot = {
  source: string;
  status: 'AVAILABLE' | 'UNKNOWN';
  metrics: HealthProviderMetric[];
  reason?:
    | 'AUTHENTICATION_FAILED'
    | 'AUTHORIZATION_FAILED'
    | 'RATE_LIMITED'
    | 'PROVIDER_UNAVAILABLE'
    | 'PROVIDER_ERROR';
};

export function parseSupabasePrometheusMetrics(text: string): HealthProviderMetric[];

export class SupabaseMetricsProvider {
  constructor(input: {
    projectRef: string;
    healthToken: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  });
  collect(): Promise<HealthProviderSnapshot>;
}

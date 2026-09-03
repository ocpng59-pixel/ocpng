export type HealthProviderStatus = 'AVAILABLE' | 'UNKNOWN';

export interface HealthProviderMetric {
  code: string;
  value: number;
}

export interface HealthProviderSnapshot {
  source: string;
  status: HealthProviderStatus;
  metrics: HealthProviderMetric[];
  reason?:
    | 'AUTHENTICATION_FAILED'
    | 'AUTHORIZATION_FAILED'
    | 'RATE_LIMITED'
    | 'PROVIDER_UNAVAILABLE'
    | 'PROVIDER_ERROR';
}

export interface HealthMetricsProvider {
  collect(): Promise<HealthProviderSnapshot>;
}

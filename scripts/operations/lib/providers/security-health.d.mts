export interface SecurityAggregateValues {
  failedPrivilegedOps24h?: number;
  failedLogins24h?: number;
  advisorWarningCount?: number;
}

export interface SecurityAggregateSource {
  loadAggregates(): Promise<SecurityAggregateValues>;
}

export type HealthProviderSnapshot = {
  source: string;
  status: 'AVAILABLE' | 'UNKNOWN';
  metrics: Array<{ code: string; value: number }>;
  reason?: 'PROVIDER_UNAVAILABLE' | 'PROVIDER_ERROR';
};

export class AggregateSecurityHealthProvider {
  constructor(input?: { source?: SecurityAggregateSource });
  collect(): Promise<HealthProviderSnapshot>;
}

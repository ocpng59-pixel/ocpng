export type HealthCollectorProviderMetric = {
  code: string;
  value: number;
};

export type HealthCollectorProviderSnapshot =
  | {
      status: 'AVAILABLE';
      metrics: HealthCollectorProviderMetric[];
    }
  | {
      status: 'UNKNOWN';
      metrics: [];
      reason?: 'AUTHENTICATION_FAILED' | 'AUTHORIZATION_FAILED' | 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_ERROR';
    };

export type HealthCollectorProviderDescriptor = {
  source: string;
  provider: {
    collect(): Promise<HealthCollectorProviderSnapshot> | HealthCollectorProviderSnapshot;
  };
};

export type PersistedHealthCollectorMetric = {
  metric_code: string;
  value: number;
};

export type HealthCollectorRecordSnapshotInput = {
  source: string;
  observedAt: string;
  metrics: PersistedHealthCollectorMetric[];
  safeMetadata: {
    collector: 'WASDOK-85';
    provider_status: 'AVAILABLE' | 'UNKNOWN';
    reason?: 'AUTHENTICATION_FAILED' | 'AUTHORIZATION_FAILED' | 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_ERROR';
  };
};

export type HealthCollectorResult = {
  status: 'COMPLETED' | 'COMPLETED_WITH_UNKNOWN';
  collectedSources: number;
  unknownSources: string[];
};

export const HEALTH_COLLECTOR_ALLOWED_METRIC_CODES: readonly string[];

export function normalizeHealthProviderMetrics(
  metrics: unknown,
): PersistedHealthCollectorMetric[];

export function runHealthCollector(input: {
  providers: HealthCollectorProviderDescriptor[];
  recordSnapshot(input: HealthCollectorRecordSnapshotInput): Promise<void> | void;
  now?: () => Date;
  providerTimeoutMs?: number;
}): Promise<HealthCollectorResult>;

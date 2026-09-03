import type {
  HealthMetricsProvider,
  HealthProviderMetric,
  HealthProviderSnapshot,
} from '@/lib/operations/health/provider-types';

export interface SecurityAggregateValues {
  failedPrivilegedOps24h?: number;
  failedLogins24h?: number;
  advisorWarningCount?: number;
}

export interface SecurityAggregateSource {
  loadAggregates(): Promise<SecurityAggregateValues>;
}

type Input = {
  source?: SecurityAggregateSource;
};

function isValidCount(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

export class AggregateSecurityHealthProvider implements HealthMetricsProvider {
  private readonly source?: SecurityAggregateSource;

  constructor(input: Input = {}) {
    this.source = input.source;
  }

  async collect(): Promise<HealthProviderSnapshot> {
    if (!this.source) {
      return {
        source: 'security',
        status: 'UNKNOWN',
        metrics: [],
        reason: 'PROVIDER_UNAVAILABLE',
      };
    }

    try {
      const values = await this.source.loadAggregates();
      const candidates: Array<[string, number | undefined]> = [
        ['security.failed_privileged_ops_24h', values.failedPrivilegedOps24h],
        ['security.failed_logins_24h', values.failedLogins24h],
        ['security.advisor_warning_count', values.advisorWarningCount],
      ];

      for (const [, value] of candidates) {
        if (value !== undefined && !isValidCount(value)) {
          return {
            source: 'security',
            status: 'UNKNOWN',
            metrics: [],
            reason: 'PROVIDER_ERROR',
          };
        }
      }

      const metrics: HealthProviderMetric[] = candidates
        .filter((entry): entry is [string, number] => isValidCount(entry[1]))
        .map(([code, value]) => ({ code, value }));

      if (metrics.length === 0) {
        return {
          source: 'security',
          status: 'UNKNOWN',
          metrics: [],
          reason: 'PROVIDER_UNAVAILABLE',
        };
      }

      return { source: 'security', status: 'AVAILABLE', metrics };
    } catch {
      return {
        source: 'security',
        status: 'UNKNOWN',
        metrics: [],
        reason: 'PROVIDER_ERROR',
      };
    }
  }
}

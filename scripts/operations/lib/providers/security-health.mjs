function isValidCount(value) {
  return value !== undefined && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

export class AggregateSecurityHealthProvider {
  constructor(input = {}) {
    this.source = input.source;
  }

  async collect() {
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
      const candidates = [
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

      const metrics = candidates
        .filter((entry) => isValidCount(entry[1]))
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

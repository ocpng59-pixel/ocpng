import type {
  HealthMetricsProvider,
  HealthProviderMetric,
  HealthProviderSnapshot,
} from '@/lib/operations/health/provider-types';

export interface BackupHealthDataSource {
  loadLastVerifiedBackupAt(): Promise<string | null>;
  loadLastCompletedRestoreTestAt(): Promise<string | null>;
}

type Input = {
  source: BackupHealthDataSource;
  now?: () => Date;
};

function ageSeconds(timestamp: string, now: Date): number {
  const observed = new Date(timestamp);
  if (Number.isNaN(observed.getTime())) throw new Error('INVALID_TIMESTAMP');

  const age = Math.floor((now.getTime() - observed.getTime()) / 1000);
  if (age < 0) throw new Error('FUTURE_TIMESTAMP');
  return age;
}

export class BackupHealthProvider implements HealthMetricsProvider {
  private readonly source: BackupHealthDataSource;
  private readonly now: () => Date;

  constructor(input: Input) {
    this.source = input.source;
    this.now = input.now ?? (() => new Date());
  }

  async collect(): Promise<HealthProviderSnapshot> {
    try {
      const [lastVerifiedBackupAt, lastCompletedRestoreTestAt] = await Promise.all([
        this.source.loadLastVerifiedBackupAt(),
        this.source.loadLastCompletedRestoreTestAt(),
      ]);

      const currentTime = this.now();
      const metrics: HealthProviderMetric[] = [];

      if (lastVerifiedBackupAt !== null) {
        metrics.push({
          code: 'backup.last_verified_age_seconds',
          value: ageSeconds(lastVerifiedBackupAt, currentTime),
        });
      }

      if (lastCompletedRestoreTestAt !== null) {
        metrics.push({
          code: 'backup.last_restore_rehearsal_age_seconds',
          value: ageSeconds(lastCompletedRestoreTestAt, currentTime),
        });
      }

      if (metrics.length === 0) {
        return {
          source: 'backup',
          status: 'UNKNOWN',
          metrics: [],
          reason: 'PROVIDER_UNAVAILABLE',
        };
      }

      return { source: 'backup', status: 'AVAILABLE', metrics };
    } catch {
      return {
        source: 'backup',
        status: 'UNKNOWN',
        metrics: [],
        reason: 'PROVIDER_ERROR',
      };
    }
  }
}

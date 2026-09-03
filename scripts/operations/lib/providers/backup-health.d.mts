export interface BackupHealthDataSource {
  loadLastVerifiedBackupAt(): Promise<string | null>;
  loadLastCompletedRestoreTestAt(): Promise<string | null>;
}

export type HealthProviderMetric = { code: string; value: number };
export type HealthProviderSnapshot = {
  source: string;
  status: 'AVAILABLE' | 'UNKNOWN';
  metrics: HealthProviderMetric[];
  reason?: 'PROVIDER_UNAVAILABLE' | 'PROVIDER_ERROR';
};

export class BackupHealthProvider {
  constructor(input: { source: BackupHealthDataSource; now?: () => Date });
  collect(): Promise<HealthProviderSnapshot>;
}

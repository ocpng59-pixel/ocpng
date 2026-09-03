export type HealthSnapshotPersistenceInput = {
  source: string;
  observedAt: string;
  metrics: Array<{ metric_code: string; value: number }>;
  safeMetadata: Record<string, unknown>;
};

export type DeploymentHealthPersistenceInput = {
  environment: string;
  deployedCommit?: string;
  releaseId?: string;
  expectedSchemaVersion: string;
  appliedSchemaVersion?: string;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
  observedAt: string;
};

export function createHealthSupabaseRuntime(input: {
  supabaseUrl: string;
  serviceRoleKey: string;
  createClientImpl?: (...args: unknown[]) => unknown;
}): {
  backupSource: {
    loadLastVerifiedBackupAt(): Promise<string | null>;
    loadLastCompletedRestoreTestAt(): Promise<string | null>;
  };
  loadAppliedSchemaVersion(): Promise<string>;
  recordSnapshot(input: HealthSnapshotPersistenceInput): Promise<void>;
  recordDeploymentState(state: DeploymentHealthPersistenceInput): Promise<void>;
};

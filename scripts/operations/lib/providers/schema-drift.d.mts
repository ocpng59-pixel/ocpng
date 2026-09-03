export const EXPECTED_SCHEMA_VERSION: '20260903002400';

export interface DeploymentHealthState {
  environment: string;
  deployedCommit?: string;
  releaseId?: string;
  expectedSchemaVersion: string;
  appliedSchemaVersion?: string;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
  source: 'deployment';
  provider: 'wasdok';
  observedAt: string;
}

export type HealthProviderSnapshot = {
  source: string;
  status: 'AVAILABLE' | 'UNKNOWN';
  metrics: Array<{ code: string; value: number }>;
  reason?: 'PROVIDER_ERROR';
};

export class SchemaDriftProvider {
  constructor(input: {
    loadAppliedSchemaVersion: () => Promise<string>;
    environment: string;
    deployedCommit?: string;
    releaseId?: string;
    now?: () => Date;
  });
  collect(): Promise<HealthProviderSnapshot>;
  collectDeploymentState(): Promise<DeploymentHealthState>;
}

import type {
  HealthCollectorDeploymentState,
  HealthCollectorProviderDescriptor,
  HealthCollectorRecordSnapshotInput,
} from '../lib/health-collector-runner.mjs';

export type HealthCollectorRuntime = {
  providers: HealthCollectorProviderDescriptor[];
  recordSnapshot(input: HealthCollectorRecordSnapshotInput): Promise<void>;
  recordDeploymentState(state: HealthCollectorDeploymentState): Promise<void>;
  now: () => Date;
  providerTimeoutMs: number;
};

export function createHealthCollectorRuntime(input?: {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  createClientImpl?: (...args: unknown[]) => unknown;
  now?: () => Date;
}): HealthCollectorRuntime;

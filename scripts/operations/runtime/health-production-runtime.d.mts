export type HealthCollectorRuntime = {
  providers: Array<{ source: string; provider: { collect(): Promise<unknown> } }>;
  recordSnapshot(input: unknown): Promise<void>;
  recordDeploymentState(state: unknown): Promise<void>;
  now: () => Date;
  providerTimeoutMs: number;
};

export function createHealthCollectorRuntime(input?: {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  createClientImpl?: (...args: unknown[]) => unknown;
  now?: () => Date;
}): HealthCollectorRuntime;

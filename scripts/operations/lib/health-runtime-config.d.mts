export type HealthRuntimeEnvironment = Record<string, string | undefined>;

export type HealthRuntimeConfiguration = {
  supabaseUrl: string;
  serviceRoleKey: string;
  projectRef: string;
  healthToken: string;
  publicAppUrl: string;
  environment: 'production';
  deployedCommit?: string;
  releaseId?: string;
};

export function getHealthRuntimeConfiguration(
  source?: HealthRuntimeEnvironment,
): HealthRuntimeConfiguration;

import { getHealthRuntimeConfiguration } from '../lib/health-runtime-config.mjs';
import { createHealthSupabaseRuntime } from '../lib/health-supabase-runtime.mjs';
import { ApplicationHealthProvider } from '../lib/providers/application-health.mjs';
import { SupabaseMetricsProvider } from '../lib/providers/supabase-metrics.mjs';
import { BackupHealthProvider } from '../lib/providers/backup-health.mjs';
import { SchemaDriftProvider } from '../lib/providers/schema-drift.mjs';
import { AggregateSecurityHealthProvider } from '../lib/providers/security-health.mjs';

const PROVIDER_TIMEOUT_MS = 10_000;

export function createHealthCollectorRuntime({
  env = process.env,
  fetchImpl = fetch,
  createClientImpl,
  now = () => new Date(),
} = {}) {
  const config = getHealthRuntimeConfiguration(env);
  const supabaseRuntime = createHealthSupabaseRuntime({
    supabaseUrl: config.supabaseUrl,
    serviceRoleKey: config.serviceRoleKey,
    ...(createClientImpl ? { createClientImpl } : {}),
  });

  return {
    providers: [
      {
        source: 'application',
        provider: new ApplicationHealthProvider({
          publicAppUrl: config.publicAppUrl,
          fetchImpl,
        }),
      },
      {
        source: 'supabase-management-metrics',
        provider: new SupabaseMetricsProvider({
          projectRef: config.projectRef,
          healthToken: config.healthToken,
          fetchImpl,
        }),
      },
      {
        source: 'backup',
        provider: new BackupHealthProvider({
          source: supabaseRuntime.backupSource,
          now,
        }),
      },
      {
        source: 'deployment',
        provider: new SchemaDriftProvider({
          loadAppliedSchemaVersion: supabaseRuntime.loadAppliedSchemaVersion,
          environment: config.environment,
          ...(config.deployedCommit ? { deployedCommit: config.deployedCommit } : {}),
          ...(config.releaseId ? { releaseId: config.releaseId } : {}),
          now,
        }),
      },
      {
        source: 'security',
        provider: new AggregateSecurityHealthProvider(),
      },
    ],
    recordSnapshot: supabaseRuntime.recordSnapshot,
    recordDeploymentState: supabaseRuntime.recordDeploymentState,
    now,
    providerTimeoutMs: PROVIDER_TIMEOUT_MS,
  };
}

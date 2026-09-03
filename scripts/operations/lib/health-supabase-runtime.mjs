import { createClient } from '@supabase/supabase-js';

const CLIENT_OPTIONS = Object.freeze({
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

async function newestTimestamp(client, {
  table,
  column,
  filters,
}) {
  let query = client
    .from(table)
    .select(column);

  for (const [field, value] of filters) {
    query = query.eq(field, value);
  }

  const { data, error } = await query
    .not(column, 'is', null)
    .order(column, { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error('Health runtime backup metadata read failed.');
  const timestamp = data?.[column];
  return typeof timestamp === 'string' && timestamp.trim() ? timestamp : null;
}

export function createHealthSupabaseRuntime({
  supabaseUrl,
  serviceRoleKey,
  createClientImpl = createClient,
}) {
  const client = createClientImpl(supabaseUrl, serviceRoleKey, CLIENT_OPTIONS);

  const backupSource = {
    loadLastVerifiedBackupAt: () => newestTimestamp(client, {
      table: 'backup_verifications',
      column: 'verified_at',
      filters: [['status', 'PASSED']],
    }),
    loadLastCompletedRestoreTestAt: () => newestTimestamp(client, {
      table: 'restore_runs',
      column: 'completed_at',
      filters: [
        ['restore_type', 'TEST'],
        ['status', 'COMPLETED'],
      ],
    }),
  };

  const loadAppliedSchemaVersion = async () => {
    const { data, error } = await client.rpc('read_applied_schema_version');
    if (error || typeof data !== 'string') {
      throw new Error('Health runtime schema version read failed.');
    }
    return data.trim();
  };

  const recordSnapshot = async (input) => {
    const { error } = await client.rpc('record_health_snapshot', {
      p_source: input.source,
      p_observed_at: input.observedAt,
      p_metrics: input.metrics,
      p_safe_metadata: input.safeMetadata,
    });
    if (error) throw new Error('Health runtime snapshot persistence failed.');
  };

  const recordDeploymentState = async (state) => {
    const { error } = await client.rpc('record_deployment_health_state', {
      p_environment: state.environment,
      p_deployed_commit: state.deployedCommit ?? null,
      p_release_id: state.releaseId ?? null,
      p_expected_schema_version: state.expectedSchemaVersion,
      p_applied_schema_version: state.appliedSchemaVersion ?? null,
      p_status: state.status,
      p_observed_at: state.observedAt,
    });
    if (error) throw new Error('Health runtime deployment persistence failed.');
  };

  return {
    backupSource,
    loadAppliedSchemaVersion,
    recordSnapshot,
    recordDeploymentState,
  };
}

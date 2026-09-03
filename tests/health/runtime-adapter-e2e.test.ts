import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { runHealthCollector } from '../../scripts/operations/lib/health-collector-runner.mjs';
import { createHealthCollectorRuntime } from '../../scripts/operations/runtime/health-production-runtime.mjs';

const describeRuntime = process.env.WASDOK85_RUNTIME_E2E === 'true'
  ? describe.sequential
  : describe.skip;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`WASDOK-85 runtime local Supabase environment is unavailable: ${name}.`);
  return value;
}

function serviceClient(): SupabaseClient {
  return createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function countRows(service: SupabaseClient, table: string): Promise<number> {
  const result = await service.from(table).select('id', { count: 'exact', head: true });
  expect(result.error).toBeNull();
  return result.count ?? 0;
}

describe('WASDOK-85 production runtime E2E CI contract', () => {
  it('runs the local runtime adapter E2E without production credentials', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(workflow).toContain('WASDOK85_RUNTIME_E2E="true"');
    expect(workflow).toContain('tests/health/runtime-adapter-e2e.test.ts');
    expect(workflow).not.toContain('OCPNG_SUPABASE_HEALTH_TOKEN');
    expect(workflow).not.toContain('OCPNG_SUPABASE_PROJECT_REF');
  });
});

describeRuntime('WASDOK-85 production runtime adapter local Supabase E2E', () => {
  it('persists the fixed five-source run through approved RPCs with canonical schema state', async () => {
    const service = serviceClient();
    const thresholdCountBefore = await countRows(service, 'system_health_thresholds');
    const alertCountBefore = await countRows(service, 'system_health_alerts');

    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://wasdok-runtime-e2e.example.invalid/api/health') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/analytics/endpoints/metrics') {
        return new Response(
          'pg_database_size_mb 12.5\npg_stat_database_num_backends 7\nunexpected_sensitive_metric{object_name="RESTRICTED-case-file.pdf"} 999\n',
          { status: 200, headers: { 'content-type': 'text/plain' } },
        );
      }
      throw new Error('unexpected test URL');
    });

    const runtime = createHealthCollectorRuntime({
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
        OCPNG_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
        OCPNG_SUPABASE_HEALTH_TOKEN: 'sbp_DEMO_HEALTH_TOKEN_1234567890',
        OCPNG_PUBLIC_APP_URL: 'https://wasdok-runtime-e2e.example.invalid',
        OCPNG_DEPLOYED_COMMIT: 'abcdef1234567890',
        OCPNG_RELEASE_ID: 'release-85-e2e',
      },
      fetchImpl,
      createClientImpl: vi.fn(() => service),
      now: () => new Date('2026-09-03T01:00:00.000Z'),
    });

    const result = await runHealthCollector(runtime);
    expect(result.status).toBe('COMPLETED_WITH_UNKNOWN');
    expect(result.collectedSources).toBe(5);
    expect(result.unknownSources).toEqual(['backup', 'security']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const sourceIds = [
      'application',
      'supabase-management-metrics',
      'backup',
      'deployment',
      'security',
    ];
    const snapshots = await service
      .from('system_health_snapshots')
      .select('id,source,status,safe_metadata')
      .in('source', sourceIds);
    expect(snapshots.error).toBeNull();
    expect(snapshots.data).toHaveLength(5);
    expect(new Set(snapshots.data!.map((row) => row.source))).toEqual(new Set(sourceIds));

    const snapshotIds = snapshots.data!.map((row) => row.id);
    const samples = await service
      .from('system_health_metric_samples')
      .select('snapshot_id,metric_code,numeric_value,source')
      .in('snapshot_id', snapshotIds);
    expect(samples.error).toBeNull();

    const applicationCodes = samples.data!
      .filter((row) => row.source === 'application')
      .map((row) => row.metric_code)
      .sort();
    expect(applicationCodes).toEqual(['app.availability', 'app.response_latency_ms']);

    const managementRows = samples.data!.filter((row) => row.source === 'supabase-management-metrics');
    expect(managementRows.map((row) => row.metric_code).sort()).toEqual([
      'db.connections_active',
      'db.database_bytes',
    ]);
    expect(Number(managementRows.find((row) => row.metric_code === 'db.connections_active')?.numeric_value)).toBe(7);
    expect(Number(managementRows.find((row) => row.metric_code === 'db.database_bytes')?.numeric_value)).toBe(12.5 * 1024 * 1024);

    expect(samples.data!.filter((row) => row.source === 'backup')).toHaveLength(0);
    expect(samples.data!.filter((row) => row.source === 'security')).toHaveLength(0);
    expect(samples.data!.find((row) => row.metric_code === 'deployment.schema_drift')?.numeric_value).toBe(0);

    const deployment = await service
      .from('deployment_health_state')
      .select('environment,expected_schema_version,applied_schema_version,status,source,provider')
      .eq('environment', 'production')
      .single();
    expect(deployment.error).toBeNull();
    expect(deployment.data).toMatchObject({
      environment: 'production',
      expected_schema_version: '20260903002400',
      applied_schema_version: '20260903002400',
      status: 'HEALTHY',
      source: 'deployment',
      provider: 'wasdok',
    });

    expect(await countRows(service, 'system_health_thresholds')).toBe(thresholdCountBefore);
    expect(await countRows(service, 'system_health_alerts')).toBe(alertCountBefore);
    expect(JSON.stringify({ snapshots: snapshots.data, samples: samples.data })).not.toMatch(
      /RESTRICTED-case-file|object_name|authorization|bearer|sbp_DEMO_HEALTH_TOKEN/i,
    );
  });
});

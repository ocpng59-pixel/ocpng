import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { forecastCapacity } from '@/lib/operations/health/forecast';
import { BackupHealthProvider } from '@/lib/operations/health/providers/backup-health';
import { EXPECTED_SCHEMA_VERSION, SchemaDriftProvider } from '@/lib/operations/health/providers/schema-drift';
import { evaluateMetricStatus } from '@/lib/operations/health/status';
import { runHealthCollector } from '../../scripts/operations/lib/health-collector-runner.mjs';

const describeE2E = process.env.WASDOK85_HEALTH_E2E === 'true'
  ? describe.sequential
  : describe.skip;

const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const demoPassword = 'DEMO-WASDOK85-Local-Only!';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`WASDOK-85 local Supabase environment is unavailable: ${name}.`);
  return value;
}

function serviceClient(): SupabaseClient {
  return createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function anonymousClient(): SupabaseClient {
  return createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function createDemoUser(service: SupabaseClient, label: string) {
  const email = `wasdok85-${label.toLowerCase()}-${suffix}@example.com`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { display_name: `DEMO WASDOK85 ${label}` },
  });
  expect(error).toBeNull();
  const client = anonymousClient();
  const signIn = await client.auth.signInWithPassword({ email, password: demoPassword });
  expect(signIn.error).toBeNull();
  return { id: data.user!.id, email, client };
}

async function grantPermissions(
  service: SupabaseClient,
  userId: string,
  roleCode: string,
  permissionCodes: string[],
) {
  const { data: role, error: roleError } = await service.from('roles').insert({
    code: roleCode,
    name: `DEMO WASDOK85 ${roleCode}`,
    description: 'Local-only WASDOK-85 end-to-end role.',
    role_type: 'administrative',
    classification: 'RESTRICTED',
    metadata: { demo: true, wasdok: 'WASDOK-85' },
  }).select('id').single();
  expect(roleError).toBeNull();

  const { data: permissions, error: permissionError } = await service
    .from('permissions').select('id,code').in('code', permissionCodes);
  expect(permissionError).toBeNull();
  expect(permissions).toHaveLength(permissionCodes.length);

  const rolePermissions = await service.from('role_permissions').insert(
    permissions!.map((permission) => ({
      role_id: role!.id,
      permission_id: permission.id,
      is_active: true,
      metadata: { demo: true, wasdok: 'WASDOK-85' },
    })),
  );
  expect(rolePermissions.error).toBeNull();

  const assignment = await service.from('user_roles').insert({
    user_id: userId,
    role_id: role!.id,
    is_active: true,
    metadata: { demo: true, wasdok: 'WASDOK-85' },
  });
  expect(assignment.error).toBeNull();
}

async function record(
  service: SupabaseClient,
  source: string,
  observedAt: string,
  metricCode: string,
  value: number,
  reason: string,
) {
  const result = await service.rpc('record_health_snapshot', {
    p_source: source,
    p_observed_at: observedAt,
    p_metrics: [{ metric_code: metricCode, value, reason }],
    p_safe_metadata: { collector: 'DEMO WASDOK85', provider_status: 'AVAILABLE' },
  });
  expect(result.error).toBeNull();
  return result.data as string;
}

describe('WASDOK-85 Task 9 release wiring contract', () => {
  it('runs the local-only System Health E2E in CI with fake providers only', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(workflow).toContain('System Health end-to-end (WASDOK-85)');
    expect(workflow).toContain('WASDOK85_HEALTH_E2E="true"');
    expect(workflow).toContain('tests/health/e2e.test.ts');
    expect(workflow).not.toContain('OCPNG_SUPABASE_HEALTH_TOKEN');
    expect(workflow).not.toContain('OCPNG_SUPABASE_PROJECT_REF');
  });

  it('ships the metric catalogue and gated deployment runbook', () => {
    for (const path of [
      'docs/operations/WASDOK-85-HEALTH-METRIC-CATALOG.md',
      'docs/deployment/WASDOK-85-SYSTEM-HEALTH-DEPLOYMENT.md',
    ]) expect(existsSync(path), `missing ${path}`).toBe(true);
  });

  it('extends route and static-security checks for the System Health surface', () => {
    const routes = readFileSync('scripts/routes-smoke.mjs', 'utf8');
    const security = readFileSync('scripts/static-security.mjs', 'utf8');
    expect(routes).toContain('/dashboard/operations/system-health');
    expect(routes).toContain('app/dashboard/operations/system-health/alerts/page.tsx');
    for (const token of [
      'OCPNG_SUPABASE_HEALTH_TOKEN',
      'OCPNG_SUPABASE_PROJECT_REF',
      'SUPABASE_SERVICE_ROLE_KEY',
      'createServiceSupabaseClient',
      'raw_payload',
    ]) expect(security).toContain(token);
    expect(security).toMatch(/object[_ -]?name|object[_ -]?path/i);
  });
});

describeE2E('WASDOK-85 System Health end-to-end', () => {
  let service: SupabaseClient;
  let manager: Awaited<ReturnType<typeof createDemoUser>>;
  let viewer: Awaited<ReturnType<typeof createDemoUser>>;
  let outsider: Awaited<ReturnType<typeof createDemoUser>>;

  beforeAll(async () => {
    service = serviceClient();
    manager = await createDemoUser(service, 'Manager');
    viewer = await createDemoUser(service, 'Viewer');
    outsider = await createDemoUser(service, 'Outsider');
    await grantPermissions(service, manager.id, `wasdok85_manager_${suffix}`, [
      'system.health.view', 'system.health.manage',
    ]);
    await grantPermissions(service, viewer.id, `wasdok85_viewer_${suffix}`, ['system.health.view']);
  });

  it('permits normalized health reads only to an authorized viewer', async () => {
    await record(service, 'DEMO-app', new Date().toISOString(), 'app.availability', 1, 'DEMO application available');

    const allowed = await viewer.client.rpc('read_system_health_latest_metrics', { p_domain: 'application' });
    expect(allowed.error).toBeNull();
    expect(allowed.data).toHaveLength(1);
    expect(JSON.stringify(allowed.data)).not.toMatch(/safe_metadata|raw_payload|object_name|object_path/i);

    const denied = await outsider.client.rpc('read_system_health_latest_metrics', { p_domain: 'application' });
    expect(denied.error?.code).toBe('42501');
  });

  it('audits threshold administration and drives WARNING then CRITICAL lifecycle', async () => {
    const threshold = await manager.client.rpc('admin_set_health_threshold', {
      p_metric_code: 'app.response_latency_ms',
      p_warning: 100,
      p_critical: 200,
      p_direction: 'ABOVE_IS_BAD',
      p_reason: 'DEMO WASDOK85 configure latency threshold',
    });
    expect(threshold.error).toBeNull();

    await record(service, 'DEMO-app', new Date().toISOString(), 'app.response_latency_ms', 150, 'DEMO warning latency');
    const warning = await viewer.client.rpc('read_system_health_alerts', { p_status: 'OPEN' });
    expect(warning.error).toBeNull();
    expect(warning.data?.find((row: { metric_code: string }) => row.metric_code === 'app.response_latency_ms')?.severity).toBe('WARNING');

    await record(service, 'DEMO-app', new Date().toISOString(), 'app.response_latency_ms', 250, 'DEMO critical latency');
    const critical = await viewer.client.rpc('read_system_health_alerts', { p_status: 'OPEN' });
    expect(critical.data?.find((row: { metric_code: string }) => row.metric_code === 'app.response_latency_ms')?.severity).toBe('CRITICAL');

    const audit = await service.from('audit_events')
      .select('actor_id,action,reason')
      .eq('actor_id', manager.id)
      .eq('action', 'health.threshold_changed')
      .eq('reason', 'DEMO WASDOK85 configure latency threshold');
    expect(audit.error).toBeNull();
    expect(audit.data).toHaveLength(1);
  });

  it('treats a persisted sample as UNKNOWN after its catalogue freshness window expires', async () => {
    const observedAt = '2026-09-01T00:00:00.000Z';
    await record(service, 'DEMO-app-stale', observedAt, 'app.response_latency_ms', 50, 'DEMO stale sample');
    const sample = await service.from('system_health_metric_samples')
      .select('numeric_value,observed_at,stale_after_seconds')
      .eq('source', 'DEMO-app-stale')
      .single();
    expect(sample.error).toBeNull();

    const evaluation = evaluateMetricStatus({
      code: 'app.response_latency_ms',
      value: Number(sample.data!.numeric_value),
      observedAt: sample.data!.observed_at,
      staleAfterSeconds: sample.data!.stale_after_seconds,
    }, {
      warningValue: 100,
      criticalValue: 200,
      direction: 'ABOVE_IS_BAD',
    }, '2026-09-03T00:00:00.000Z');
    expect(evaluation).toEqual({ status: 'UNKNOWN', reason: 'STALE_SAMPLE' });
  });

  it('isolates a failed provider while persisting a successful provider from the same run', async () => {
    const result = await runHealthCollector({
      providers: [
        { source: 'demo-good-provider', provider: { collect: async () => ({ status: 'AVAILABLE', metrics: [{ code: 'app.availability', value: 1 }] }) } },
        { source: 'demo-failed-provider', provider: { collect: async () => { throw new Error('DEMO provider secret must not escape'); } } },
      ],
      recordSnapshot: async ({ source, observedAt, metrics, safeMetadata }: { source: string; observedAt: string; metrics: Array<{ metric_code: string; value: number }>; safeMetadata: Record<string, unknown> }) => {
        const persisted = await service.rpc('record_health_snapshot', {
          p_source: source,
          p_observed_at: observedAt,
          p_metrics: metrics,
          p_safe_metadata: safeMetadata,
        });
        if (persisted.error) throw persisted.error;
      },
      now: () => new Date('2026-09-03T00:00:00.000Z'),
      providerTimeoutMs: 100,
    });
    expect(result.status).toBe('COMPLETED_WITH_UNKNOWN');
    expect(result.unknownSources).toEqual(['demo-failed-provider']);

    const goodSample = await service.from('system_health_metric_samples')
      .select('metric_code,numeric_value')
      .eq('source', 'demo-good-provider');
    expect(goodSample.data).toHaveLength(1);

    const failed = await service.from('system_health_snapshots')
      .select('status,safe_metadata')
      .eq('source', 'demo-failed-provider')
      .single();
    expect(failed.error).toBeNull();
    expect(failed.data?.status).toBe('UNKNOWN');
    expect(JSON.stringify(failed.data)).not.toContain('DEMO provider secret must not escape');
  });

  it('forecasts database and Storage capacity from seven distinct DEMO observation days', async () => {
    for (let day = 1; day <= 7; day += 1) {
      const observedAt = `2026-08-${String(20 + day).padStart(2, '0')}T00:00:00.000Z`;
      await record(service, 'DEMO-database-capacity', observedAt, 'db.database_bytes', day * 1_000_000, 'DEMO database growth');
      await record(service, 'DEMO-storage-capacity', observedAt, 'storage.bytes', day * 2_000_000, 'DEMO storage growth');
    }

    for (const metricCode of ['db.database_bytes', 'storage.bytes']) {
      const history = await viewer.client.rpc('read_system_health_metric_history', {
        p_metric_code: metricCode,
        p_days: 90,
      });
      expect(history.error).toBeNull();
      expect(history.data).toHaveLength(7);
      const forecast = forecastCapacity(
        history.data!.map((row: { observed_at: string; numeric_value: number | string }) => ({
          observedAt: row.observed_at,
          value: Number(row.numeric_value),
        })),
        '2026-09-03T00:00:00.000Z',
      );
      expect(forecast.status).toBe('AVAILABLE');
      expect(forecast.sampleCount).toBe(7);
      expect(forecast.projected30Days).not.toBeNull();
    }
  });

  it('consumes fictional WASDOK-55 backup fixture timestamps without protected archive content', async () => {
    const provider = new BackupHealthProvider({
      source: {
        loadLastVerifiedBackupAt: async () => '2026-09-02T23:00:00.000Z',
        loadLastCompletedRestoreTestAt: async () => '2026-09-02T20:00:00.000Z',
      },
      now: () => new Date('2026-09-03T00:00:00.000Z'),
    });
    const result = await provider.collect();
    expect(result.status).toBe('AVAILABLE');
    expect(result.metrics).toEqual([
      { code: 'backup.last_verified_age_seconds', value: 3600 },
      { code: 'backup.last_restore_rehearsal_age_seconds', value: 14400 },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/archive|filename|object_name|object_path/i);
  });

  it('detects schema drift deterministically without exposing deployment credentials', async () => {
    const healthy = new SchemaDriftProvider({
      loadAppliedSchemaVersion: async () => EXPECTED_SCHEMA_VERSION,
      environment: 'DEMO-local',
      deployedCommit: 'DEMO-COMMIT',
      releaseId: 'DEMO-RELEASE',
      now: () => new Date('2026-09-03T00:00:00.000Z'),
    });
    const drifted = new SchemaDriftProvider({
      loadAppliedSchemaVersion: async () => '20260903002200',
      environment: 'DEMO-local',
      now: () => new Date('2026-09-03T00:00:00.000Z'),
    });
    expect((await healthy.collect()).metrics).toEqual([{ code: 'deployment.schema_drift', value: 0 }]);
    expect((await drifted.collect()).metrics).toEqual([{ code: 'deployment.schema_drift', value: 1 }]);
  });
});

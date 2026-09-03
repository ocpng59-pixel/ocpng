import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const projectRef = 'abcdefghijklmnopqrst';
const serviceRoleKey = 'sb_secret_DEMO_SERVICE_ROLE_1234567890';
const healthToken = 'sbp_DEMO_HEALTH_TOKEN_1234567890';
const publicAppUrl = 'https://wasdok.example.invalid';

const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  OCPNG_SUPABASE_PROJECT_REF: projectRef,
  OCPNG_SUPABASE_HEALTH_TOKEN: healthToken,
  OCPNG_PUBLIC_APP_URL: publicAppUrl,
  OCPNG_DEPLOYED_COMMIT: 'abcdef1234567890',
  OCPNG_RELEASE_ID: 'release-85',
};

function modulePath(relativePath: string): string {
  return resolve(relativePath);
}

async function loadModule(relativePath: string) {
  return import(pathToFileURL(modulePath(relativePath)).href);
}

function requirePlannedFile(relativePath: string): boolean {
  const exists = existsSync(modulePath(relativePath));
  expect(exists, `${relativePath} must exist`).toBe(true);
  return exists;
}

describe('WASDOK-85 production health runtime RED/contract', () => {
  it('provides the reviewed production runtime adapter module', () => {
    expect(
      existsSync(resolve('scripts/operations/runtime/health-production-runtime.mjs')),
    ).toBe(true);
  });

  it('accepts only complete fail-closed production runtime configuration', async () => {
    const path = 'scripts/operations/lib/health-runtime-config.mjs';
    if (!requirePlannedFile(path)) return;
    const { getHealthRuntimeConfiguration } = await loadModule(path);

    expect(getHealthRuntimeConfiguration(validEnv)).toEqual({
      supabaseUrl: `https://${projectRef}.supabase.co`,
      serviceRoleKey,
      projectRef,
      healthToken,
      publicAppUrl,
      environment: 'production',
      deployedCommit: 'abcdef1234567890',
      releaseId: 'release-85',
    });

    for (const key of [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'OCPNG_SUPABASE_PROJECT_REF',
      'OCPNG_SUPABASE_HEALTH_TOKEN',
      'OCPNG_PUBLIC_APP_URL',
    ] as const) {
      expect(() => getHealthRuntimeConfiguration({ ...validEnv, [key]: undefined })).toThrow(
        'System health runtime configuration is unavailable.',
      );
    }
  });

  it('rejects invalid secret/url/deployment inputs without echoing them', async () => {
    const path = 'scripts/operations/lib/health-runtime-config.mjs';
    if (!requirePlannedFile(path)) return;
    const { getHealthRuntimeConfiguration } = await loadModule(path);
    const invalidValues = [
      ['SUPABASE_SERVICE_ROLE_KEY', 'not-a-service-role'],
      ['OCPNG_SUPABASE_HEALTH_TOKEN', 'health token with spaces'],
      ['OCPNG_PUBLIC_APP_URL', 'https://user:password@example.invalid'],
      ['OCPNG_DEPLOYED_COMMIT', 'not-a-commit'],
      ['OCPNG_RELEASE_ID', 'bad release id'],
    ] as const;

    for (const [key, value] of invalidValues) {
      try {
        getHealthRuntimeConfiguration({ ...validEnv, [key]: value });
        throw new Error('expected runtime configuration rejection');
      } catch (error) {
        expect(String(error)).toContain('System health runtime configuration is unavailable.');
        expect(String(error)).not.toContain(value);
      }
    }
  });

  it('probes only the public health endpoint and emits availability plus latency', async () => {
    const path = 'scripts/operations/lib/providers/application-health.mjs';
    if (!requirePlannedFile(path)) return;
    const { ApplicationHealthProvider } = await loadModule(path);
    const times = [1000, 1042];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${publicAppUrl}/api/health`);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const provider = new ApplicationHealthProvider({
      publicAppUrl,
      fetchImpl,
      nowMs: () => times.shift() ?? 1042,
    });

    await expect(provider.collect()).resolves.toEqual({
      source: 'application',
      status: 'AVAILABLE',
      metrics: [
        { code: 'app.availability', value: 1 },
        { code: 'app.response_latency_ms', value: 42 },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not read a non-2xx response body or synthesize HTTP error rate', async () => {
    const path = 'scripts/operations/lib/providers/application-health.mjs';
    if (!requirePlannedFile(path)) return;
    const { ApplicationHealthProvider } = await loadModule(path);
    const text = vi.fn(async () => 'SECRET_RESPONSE_BODY');
    const json = vi.fn(async () => ({ secret: 'SECRET_RESPONSE_BODY' }));
    const times = [2000, 2010];
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      text,
      json,
    }));

    const result = await new ApplicationHealthProvider({
      publicAppUrl,
      fetchImpl,
      nowMs: () => times.shift() ?? 2010,
    }).collect();

    expect(result).toEqual({
      source: 'application',
      status: 'AVAILABLE',
      metrics: [
        { code: 'app.availability', value: 0 },
        { code: 'app.response_latency_ms', value: 10 },
      ],
    });
    expect(text).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('app.http_error_rate');
    expect(JSON.stringify(result)).not.toContain('SECRET_RESPONSE_BODY');
  });

  it('normalizes network and malformed-success failures without provider details', async () => {
    const path = 'scripts/operations/lib/providers/application-health.mjs';
    if (!requirePlannedFile(path)) return;
    const { ApplicationHealthProvider } = await loadModule(path);

    const networkProvider = new ApplicationHealthProvider({
      publicAppUrl,
      fetchImpl: async () => { throw new Error('private network detail'); },
    });
    await expect(networkProvider.collect()).resolves.toEqual({
      source: 'application',
      status: 'UNKNOWN',
      metrics: [],
      reason: 'PROVIDER_UNAVAILABLE',
    });

    const malformedProvider = new ApplicationHealthProvider({
      publicAppUrl,
      fetchImpl: async () => new Response(JSON.stringify({ status: 'unexpected' }), { status: 200 }),
    });
    const malformed = await malformedProvider.collect();
    expect(malformed).toEqual({
      source: 'application',
      status: 'UNKNOWN',
      metrics: [],
      reason: 'PROVIDER_ERROR',
    });
    expect(JSON.stringify(malformed)).not.toContain('unexpected');
  });

  it('creates one service client and exposes only approved backup/RPC operations', async () => {
    const path = 'scripts/operations/lib/health-supabase-runtime.mjs';
    if (!requirePlannedFile(path)) return;
    const { createHealthSupabaseRuntime } = await loadModule(path);

    const queryCalls: Array<[string, ...unknown[]]> = [];
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'read_applied_schema_version') return { data: '20260903002400', error: null };
      return { data: '00000000-0000-0000-0000-000000000001', error: null, args };
    });
    const makeBuilder = (table: string) => {
      const builder: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ['select', 'eq', 'not', 'order', 'limit']) {
        builder[method] = (...args: unknown[]) => {
          queryCalls.push([`${table}.${method}`, ...args]);
          return builder;
        };
      }
      builder.maybeSingle = async () => ({
        data: table === 'backup_verifications'
          ? { verified_at: '2026-09-03T00:10:00.000Z' }
          : { completed_at: '2026-09-02T00:40:00.000Z' },
        error: null,
      });
      return builder;
    };
    const client = {
      from: vi.fn((table: string) => makeBuilder(table)),
      rpc,
    };
    const createClientImpl = vi.fn(() => client);

    const runtime = createHealthSupabaseRuntime({
      supabaseUrl: validEnv.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey,
      createClientImpl,
    });

    expect(createClientImpl).toHaveBeenCalledTimes(1);
    expect(createClientImpl).toHaveBeenCalledWith(
      validEnv.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );

    await expect(runtime.backupSource.loadLastVerifiedBackupAt()).resolves.toBe('2026-09-03T00:10:00.000Z');
    await expect(runtime.backupSource.loadLastCompletedRestoreTestAt()).resolves.toBe('2026-09-02T00:40:00.000Z');
    expect(client.from).toHaveBeenNthCalledWith(1, 'backup_verifications');
    expect(client.from).toHaveBeenNthCalledWith(2, 'restore_runs');
    expect(queryCalls).toContainEqual(['backup_verifications.select', 'verified_at']);
    expect(queryCalls).toContainEqual(['backup_verifications.eq', 'status', 'PASSED']);
    expect(queryCalls).toContainEqual(['restore_runs.select', 'completed_at']);
    expect(queryCalls).toContainEqual(['restore_runs.eq', 'restore_type', 'TEST']);
    expect(queryCalls).toContainEqual(['restore_runs.eq', 'status', 'COMPLETED']);

    await expect(runtime.loadAppliedSchemaVersion()).resolves.toBe('20260903002400');
    expect(rpc).toHaveBeenCalledWith('read_applied_schema_version');

    await runtime.recordSnapshot({
      source: 'application',
      observedAt: '2026-09-03T01:00:00.000Z',
      metrics: [{ metric_code: 'app.availability', value: 1 }],
      safeMetadata: { collector: 'WASDOK-85', provider_status: 'AVAILABLE' },
    });
    expect(rpc).toHaveBeenCalledWith('record_health_snapshot', {
      p_source: 'application',
      p_observed_at: '2026-09-03T01:00:00.000Z',
      p_metrics: [{ metric_code: 'app.availability', value: 1 }],
      p_safe_metadata: { collector: 'WASDOK-85', provider_status: 'AVAILABLE' },
    });

    await runtime.recordDeploymentState({
      environment: 'production',
      deployedCommit: 'abcdef1234567890',
      releaseId: 'release-85',
      expectedSchemaVersion: '20260903002400',
      appliedSchemaVersion: '20260903002400',
      status: 'HEALTHY',
      observedAt: '2026-09-03T01:00:00.000Z',
    });
    expect(rpc).toHaveBeenCalledWith('record_deployment_health_state', {
      p_environment: 'production',
      p_deployed_commit: 'abcdef1234567890',
      p_release_id: 'release-85',
      p_expected_schema_version: '20260903002400',
      p_applied_schema_version: '20260903002400',
      p_status: 'HEALTHY',
      p_observed_at: '2026-09-03T01:00:00.000Z',
    });
  });

  it('composes exactly the five approved production sources', async () => {
    const path = 'scripts/operations/runtime/health-production-runtime.mjs';
    if (!requirePlannedFile(path)) return;
    const { createHealthCollectorRuntime } = await loadModule(path);
    const client = {
      from: vi.fn(() => {
        const builder: Record<string, (...args: unknown[]) => unknown> = {};
        for (const method of ['select', 'eq', 'not', 'order', 'limit']) {
          builder[method] = () => builder;
        }
        builder.maybeSingle = async () => ({ data: null, error: null });
        return builder;
      }),
      rpc: vi.fn(async (name: string) => (
        name === 'read_applied_schema_version'
          ? { data: '20260903002400', error: null }
          : { data: null, error: null }
      )),
    };

    const runtime = createHealthCollectorRuntime({
      env: validEnv,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 })),
      createClientImpl: vi.fn(() => client),
      now: () => new Date('2026-09-03T01:00:00.000Z'),
    });

    expect(runtime.providers.map((item: { source: string }) => item.source)).toEqual([
      'application',
      'supabase-management-metrics',
      'backup',
      'deployment',
      'security',
    ]);
    expect(runtime.providerTimeoutMs).toBe(10_000);
    expect(runtime.recordSnapshot).toBeTypeOf('function');
    expect(runtime.recordDeploymentState).toBeTypeOf('function');

    const deployment = runtime.providers.find((item: { source: string }) => item.source === 'deployment');
    await expect(deployment.provider.collect()).resolves.toEqual({
      source: 'deployment',
      status: 'AVAILABLE',
      metrics: [{ code: 'deployment.schema_drift', value: 0 }],
    });
    const security = runtime.providers.find((item: { source: string }) => item.source === 'security');
    await expect(security.provider.collect()).resolves.toEqual({
      source: 'security',
      status: 'UNKNOWN',
      metrics: [],
      reason: 'PROVIDER_UNAVAILABLE',
    });
  });
});

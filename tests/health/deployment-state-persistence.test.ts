import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const RUNNER_PATH = resolve(process.cwd(), 'scripts/operations/lib/health-collector-runner.mjs');
const CLI_PATH = resolve(process.cwd(), 'scripts/operations/health-collector.mjs');
const MIGRATION_PATH = resolve(process.cwd(), 'supabase/migrations/20260903002300_system_health_direct_write_boundary.sql');

async function loadRunner() {
  return import(pathToFileURL(RUNNER_PATH).href);
}

describe('WASDOK-85 deployment state persistence', () => {
  it('persists only normalized safe deployment identifiers from the deployment provider', async () => {
    const { runHealthCollector } = await loadRunner();
    const recordSnapshot = vi.fn(async () => 'snapshot-id');
    const recordDeploymentState = vi.fn(async () => undefined);

    const deploymentProvider = {
      collect: async () => ({
        source: 'deployment',
        status: 'AVAILABLE',
        metrics: [{ code: 'deployment.schema_drift', value: 0 }],
      }),
      collectDeploymentState: async () => ({
        environment: 'production',
        deployedCommit: 'abcdef1234567890',
        releaseId: 'release-85',
        expectedSchemaVersion: '20260903002300',
        appliedSchemaVersion: '20260903002300',
        status: 'HEALTHY',
        source: 'deployment',
        provider: 'wasdok',
        observedAt: '2026-09-03T02:30:00.000Z',
        rawEnvironment: 'SUPABASE_SERVICE_ROLE_KEY=DEMO-SECRET-MUST-NOT-PERSIST',
      }),
    };

    await runHealthCollector({
      providers: [{ source: 'deployment', provider: deploymentProvider }],
      recordSnapshot,
      recordDeploymentState,
      now: () => new Date('2026-09-03T02:30:00.000Z'),
      providerTimeoutMs: 1_000,
    });

    expect(recordSnapshot).toHaveBeenCalledOnce();
    expect(recordDeploymentState).toHaveBeenCalledOnce();
    expect(recordDeploymentState).toHaveBeenCalledWith({
      environment: 'production',
      deployedCommit: 'abcdef1234567890',
      releaseId: 'release-85',
      expectedSchemaVersion: '20260903002300',
      appliedSchemaVersion: '20260903002300',
      status: 'HEALTHY',
      source: 'deployment',
      provider: 'wasdok',
      observedAt: '2026-09-03T02:30:00.000Z',
    });
    expect(JSON.stringify(recordDeploymentState.mock.calls)).not.toContain('DEMO-SECRET-MUST-NOT-PERSIST');
    expect(JSON.stringify(recordDeploymentState.mock.calls)).not.toContain('rawEnvironment');
  });

  it('isolates an auxiliary deployment-state provider failure without aborting other telemetry', async () => {
    const { runHealthCollector } = await loadRunner();
    const recordSnapshot = vi.fn(async () => 'snapshot-id');
    const recordDeploymentState = vi.fn(async () => undefined);

    const result = await runHealthCollector({
      providers: [
        {
          source: 'deployment',
          provider: {
            collect: async () => ({
              source: 'deployment',
              status: 'AVAILABLE',
              metrics: [{ code: 'deployment.schema_drift', value: 0 }],
            }),
            collectDeploymentState: async () => {
              throw new Error('DEMO-DEPLOYMENT-SECRET-MUST-NOT-ESCAPE');
            },
          },
        },
        {
          source: 'storage',
          provider: {
            collect: async () => ({
              source: 'storage',
              status: 'AVAILABLE',
              metrics: [{ code: 'storage.object_count', value: 4 }],
            }),
          },
        },
      ],
      recordSnapshot,
      recordDeploymentState,
      now: () => new Date('2026-09-03T02:35:00.000Z'),
      providerTimeoutMs: 1_000,
    });

    expect(recordSnapshot).toHaveBeenCalledTimes(2);
    expect(recordSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      source: 'storage',
      metrics: [{ metric_code: 'storage.object_count', value: 4 }],
    }));
    expect(recordDeploymentState).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'COMPLETED_WITH_UNKNOWN',
      collectedSources: 2,
      unknownSources: ['deployment'],
    });
    expect(JSON.stringify(recordSnapshot.mock.calls)).not.toContain('DEMO-DEPLOYMENT-SECRET-MUST-NOT-ESCAPE');
  });

  it('wires deployment-state persistence through the single-run CLI runtime boundary', () => {
    const cli = readFileSync(CLI_PATH, 'utf8');
    expect(cli).toContain('recordDeploymentState: runtime?.recordDeploymentState');
  });

  it('defines a service-role-only deployment state RPC in the final migration', () => {
    const migration = readFileSync(MIGRATION_PATH, 'utf8');
    expect(migration).toContain('record_deployment_health_state');
    expect(migration).toMatch(/grant execute on function public\.record_deployment_health_state[\s\S]*to service_role/i);
    expect(migration).toMatch(/revoke all on function public\.record_deployment_health_state[\s\S]*from public, anon, authenticated/i);
  });
});

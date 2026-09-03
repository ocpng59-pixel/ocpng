import { describe, expect, it, vi } from 'vitest';
import {
  BackupHealthProvider,
  type BackupHealthDataSource,
} from '@/lib/operations/health/providers/backup-health';
import {
  AggregateSecurityHealthProvider,
  type SecurityAggregateSource,
} from '@/lib/operations/health/providers/security-health';
import {
  EXPECTED_SCHEMA_VERSION,
  SchemaDriftProvider,
} from '@/lib/operations/health/providers/schema-drift';

const NOW = new Date('2026-09-03T00:40:00.000Z');

describe('WASDOK-85 backup health integration', () => {
  it('derives backup age only from WASDOK-55 verified metadata', async () => {
    const source: BackupHealthDataSource = {
      loadLastVerifiedBackupAt: vi.fn(async () => '2026-09-03T00:10:00.000Z'),
      loadLastCompletedRestoreTestAt: vi.fn(async () => '2026-09-02T00:40:00.000Z'),
    };

    const result = await new BackupHealthProvider({ source, now: () => NOW }).collect();

    expect(result).toEqual({
      source: 'backup',
      status: 'AVAILABLE',
      metrics: [
        { code: 'backup.last_verified_age_seconds', value: 1800 },
        { code: 'backup.last_restore_rehearsal_age_seconds', value: 86400 },
      ],
    });
    expect(source.loadLastVerifiedBackupAt).toHaveBeenCalledTimes(1);
    expect(source.loadLastCompletedRestoreTestAt).toHaveBeenCalledTimes(1);
  });

  it('never converts missing backup metadata into a healthy zero', async () => {
    const source: BackupHealthDataSource = {
      loadLastVerifiedBackupAt: async () => null,
      loadLastCompletedRestoreTestAt: async () => null,
    };

    await expect(new BackupHealthProvider({ source, now: () => NOW }).collect()).resolves.toEqual({
      source: 'backup',
      status: 'UNKNOWN',
      metrics: [],
      reason: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('returns only the available backup metric when one recovery signal is missing', async () => {
    const source: BackupHealthDataSource = {
      loadLastVerifiedBackupAt: async () => '2026-09-03T00:35:00.000Z',
      loadLastCompletedRestoreTestAt: async () => null,
    };

    await expect(new BackupHealthProvider({ source, now: () => NOW }).collect()).resolves.toEqual({
      source: 'backup',
      status: 'AVAILABLE',
      metrics: [{ code: 'backup.last_verified_age_seconds', value: 300 }],
    });
  });

  it('fails closed on malformed/future timestamps rather than producing negative ages', async () => {
    const source: BackupHealthDataSource = {
      loadLastVerifiedBackupAt: async () => '2026-09-03T00:50:00.000Z',
      loadLastCompletedRestoreTestAt: async () => 'not-a-date',
    };

    const result = await new BackupHealthProvider({ source, now: () => NOW }).collect();
    expect(result.status).toBe('UNKNOWN');
    expect(result.metrics).toEqual([]);
    expect(result.reason).toBe('PROVIDER_ERROR');
  });

  it('fails closed when WASDOK-55 metadata cannot be read', async () => {
    const source: BackupHealthDataSource = {
      loadLastVerifiedBackupAt: async () => { throw new Error('database unavailable'); },
      loadLastCompletedRestoreTestAt: async () => null,
    };

    const result = await new BackupHealthProvider({ source, now: () => NOW }).collect();
    expect(result).toEqual({ source: 'backup', status: 'UNKNOWN', metrics: [], reason: 'PROVIDER_ERROR' });
  });
});

describe('WASDOK-85 aggregate security integration', () => {
  it('stays UNKNOWN until WASDOK-48 provides an approved aggregate source', async () => {
    await expect(new AggregateSecurityHealthProvider().collect()).resolves.toEqual({
      source: 'security',
      status: 'UNKNOWN',
      metrics: [],
      reason: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('maps only approved aggregate counters and accepts legitimate zero values', async () => {
    const source: SecurityAggregateSource = {
      loadAggregates: vi.fn(async () => ({
        failedPrivilegedOps24h: 2,
        failedLogins24h: 0,
        advisorWarningCount: 3,
      })),
    };

    await expect(new AggregateSecurityHealthProvider({ source }).collect()).resolves.toEqual({
      source: 'security',
      status: 'AVAILABLE',
      metrics: [
        { code: 'security.failed_privileged_ops_24h', value: 2 },
        { code: 'security.failed_logins_24h', value: 0 },
        { code: 'security.advisor_warning_count', value: 3 },
      ],
    });
  });

  it('rejects invalid aggregate values and does not leak source errors', async () => {
    const invalidSource: SecurityAggregateSource = {
      loadAggregates: async () => ({ failedPrivilegedOps24h: -1 }),
    };
    const failedSource: SecurityAggregateSource = {
      loadAggregates: async () => { throw new Error('secret provider detail'); },
    };

    for (const source of [invalidSource, failedSource]) {
      const result = await new AggregateSecurityHealthProvider({ source }).collect();
      expect(result).toEqual({ source: 'security', status: 'UNKNOWN', metrics: [], reason: 'PROVIDER_ERROR' });
      expect(JSON.stringify(result)).not.toContain('secret provider detail');
    }
  });
});

describe('WASDOK-85 deployment schema drift integration', () => {
  it('pins the expected schema version to the final WASDOK-85 hotfix migration', () => {
    expect(EXPECTED_SCHEMA_VERSION).toBe('20260903002400');
  });

  it('reports no drift when applied and expected migration versions match', async () => {
    const provider = new SchemaDriftProvider({
      loadAppliedSchemaVersion: async () => EXPECTED_SCHEMA_VERSION,
      environment: 'production',
      deployedCommit: 'abcdef1234567890',
      releaseId: 'release-85',
      now: () => NOW,
    });

    await expect(provider.collect()).resolves.toEqual({
      source: 'deployment',
      status: 'AVAILABLE',
      metrics: [{ code: 'deployment.schema_drift', value: 0 }],
    });
    await expect(provider.collectDeploymentState()).resolves.toEqual({
      environment: 'production',
      deployedCommit: 'abcdef1234567890',
      releaseId: 'release-85',
      expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      appliedSchemaVersion: EXPECTED_SCHEMA_VERSION,
      status: 'HEALTHY',
      source: 'deployment',
      provider: 'wasdok',
      observedAt: NOW.toISOString(),
    });
  });

  it('reports deterministic drift when the applied migration version differs', async () => {
    const provider = new SchemaDriftProvider({
      loadAppliedSchemaVersion: async () => '20260903002200',
      environment: 'production',
      now: () => NOW,
    });

    await expect(provider.collect()).resolves.toEqual({
      source: 'deployment',
      status: 'AVAILABLE',
      metrics: [{ code: 'deployment.schema_drift', value: 1 }],
    });
    const state = await provider.collectDeploymentState();
    expect(state.status).toBe('CRITICAL');
    expect(state.appliedSchemaVersion).toBe('20260903002200');
  });

  it('returns UNKNOWN rather than healthy when migration history cannot be read', async () => {
    const provider = new SchemaDriftProvider({
      loadAppliedSchemaVersion: async () => { throw new Error('migration query failed'); },
      environment: 'production',
      now: () => NOW,
    });

    await expect(provider.collect()).resolves.toEqual({
      source: 'deployment',
      status: 'UNKNOWN',
      metrics: [],
      reason: 'PROVIDER_ERROR',
    });
    const state = await provider.collectDeploymentState();
    expect(state.status).toBe('UNKNOWN');
    expect(state.appliedSchemaVersion).toBeUndefined();
    expect(JSON.stringify(state)).not.toContain('migration query failed');
  });
});

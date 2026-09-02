import { describe, expect, it, vi } from 'vitest';
import {
  enqueueDueSchedules,
  purgeExpiredArtifacts,
  runBackupJob,
} from '../../scripts/operations/lib/backup-job-runner.mjs';
import { redactOperationalText } from '../../scripts/operations/lib/redaction.mjs';

function successfulDependencies() {
  const transitions: string[] = [];
  const verifications: string[] = [];
  const cleanups: string[] = [];
  const logs: string[] = [];

  return {
    transitions,
    verifications,
    cleanups,
    logs,
    deps: {
      loadJob: async () => ({ id: '55000000-0000-0000-0000-000000000801', status: 'QUEUED', backupType: 'FULL' }),
      transition: async (_jobId: string, from: string, to: string) => { transitions.push(`${from}->${to}`); },
      exportDatabase: async () => ({ files: ['/tmp/data.sql'], byteSize: 10 }),
      verifyIdentity: async () => ({ covered: true, method: 'VERIFIED_PROVIDER_RECOVERY' }),
      exportStorage: async () => ({ files: ['/tmp/storage_manifest.json'], objectCount: 1, byteSize: 5 }),
      packageArchive: async () => ({
        filePath: '/tmp/demo.zip.enc', byteSize: 20, checksumSha256: 'a'.repeat(64),
        encryption: { algorithm: 'AES-256-GCM', nonceBase64: 'bm9uY2U=', authTagBase64: 'dGFn', keyRef: 'kms://ocpng/backup-key-v1' },
      }),
      verifyArchive: async () => true,
      storeArchive: async () => ({ ref: 'backups/demo.zip.enc', byteSize: 20, checksumSha256: 'a'.repeat(64) }),
      recordVerification: async (_jobId: string, status: string) => { verifications.push(status); },
      cleanup: async (jobId: string) => { cleanups.push(jobId); },
      log: (message: string) => { logs.push(message); },
    },
  };
}

describe('WASDOK-55 backup operations worker', () => {
  it('executes the exact QUEUED → RUNNING → PACKAGING → VERIFYING → AVAILABLE lifecycle', async () => {
    const fixture = successfulDependencies();
    const result = await runBackupJob({ jobId: '55000000-0000-0000-0000-000000000801', ...fixture.deps });

    expect(fixture.transitions).toEqual([
      'QUEUED->RUNNING',
      'RUNNING->PACKAGING',
      'PACKAGING->VERIFYING',
      'VERIFYING->AVAILABLE',
    ]);
    expect(fixture.verifications).toEqual(['PASSED']);
    expect(fixture.cleanups).toEqual(['55000000-0000-0000-0000-000000000801']);
    expect(result.status).toBe('AVAILABLE');
    expect(result.archiveRef).toBe('backups/demo.zip.enc');
  });

  it('fails closed on a mandatory provider failure, redacts secrets, and always cleans temporary material', async () => {
    const fixture = successfulDependencies();
    fixture.deps.exportStorage = async () => {
      throw new Error('storage failed token=DEMO-SUPER-SECRET postgresql://postgres:pw@db.invalid/postgres');
    };

    await expect(runBackupJob({ jobId: '55000000-0000-0000-0000-000000000802', ...fixture.deps })).rejects.toThrow(/backup job failed/i);
    expect(fixture.transitions).toEqual(['QUEUED->RUNNING', 'RUNNING->FAILED']);
    expect(fixture.verifications).toEqual([]);
    expect(fixture.cleanups).toEqual(['55000000-0000-0000-0000-000000000802']);
    expect(fixture.logs.join(' ')).not.toContain('DEMO-SUPER-SECRET');
    expect(fixture.logs.join(' ')).not.toContain('postgres:pw');
  });

  it('does not rewrite prior transition evidence when a later job is retried as a new job', async () => {
    const auditEvidence: string[] = [];
    const first = successfulDependencies();
    first.deps.transition = async (_id: string, from: string, to: string) => { auditEvidence.push(`job-a:${from}->${to}`); };
    first.deps.exportDatabase = async () => { throw new Error('provider unavailable'); };
    await expect(runBackupJob({ jobId: 'job-a-0001', ...first.deps })).rejects.toThrow();
    const snapshot = [...auditEvidence];

    const retry = successfulDependencies();
    retry.deps.transition = async (_id: string, from: string, to: string) => { auditEvidence.push(`job-b:${from}->${to}`); };
    await runBackupJob({ jobId: 'job-b-0001', ...retry.deps });

    expect(auditEvidence.slice(0, snapshot.length)).toEqual(snapshot);
    expect(auditEvidence.some((event) => event.startsWith('job-b:'))).toBe(true);
  });

  it('enqueues each due schedule at most once with a deterministic idempotency key', async () => {
    const enqueue = vi.fn(async () => undefined);
    const dueAt = '2026-09-03T01:00:00.000Z';
    const schedules = [
      { id: 'schedule-1', enabled: true, nextRunAt: dueAt, backupType: 'FULL' },
      { id: 'schedule-1', enabled: true, nextRunAt: dueAt, backupType: 'FULL' },
      { id: 'schedule-2', enabled: false, nextRunAt: dueAt, backupType: 'FULL' },
      { id: 'schedule-3', enabled: true, nextRunAt: '2026-09-04T01:00:00.000Z', backupType: 'FULL' },
    ];

    const count = await enqueueDueSchedules({ schedules, now: new Date('2026-09-03T02:00:00.000Z'), enqueue });
    expect(count).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      scheduleId: 'schedule-1',
      idempotencyKey: 'schedule-1:2026-09-03T01:00:00.000Z',
    }));
  });

  it('purges only expired artifacts governed by an active purge-enabled retention policy', async () => {
    const purge = vi.fn(async () => undefined);
    const artifacts = [
      { id: 'a', expiresAt: '2026-09-02T00:00:00.000Z', retentionPolicyId: 'p1' },
      { id: 'b', expiresAt: '2026-09-02T00:00:00.000Z', retentionPolicyId: 'p2' },
      { id: 'c', expiresAt: '2026-09-04T00:00:00.000Z', retentionPolicyId: 'p1' },
    ];
    const policies = [
      { id: 'p1', enabled: true, purgeEnabled: true },
      { id: 'p2', enabled: true, purgeEnabled: false },
    ];

    const count = await purgeExpiredArtifacts({ artifacts, policies, now: new Date('2026-09-03T00:00:00.000Z'), purge });
    expect(count).toBe(1);
    expect(purge).toHaveBeenCalledOnce();
    expect(purge).toHaveBeenCalledWith(artifacts[0]);
  });
});

describe('WASDOK-55 operational log redaction', () => {
  it('redacts bearer tokens, token assignments and database URL credentials', () => {
    const text = redactOperationalText('Bearer DEMO.BEARER.VALUE token=DEMO-TOKEN postgresql://postgres:DEMO-PASSWORD@db.invalid/postgres');
    expect(text).not.toContain('DEMO.BEARER.VALUE');
    expect(text).not.toContain('DEMO-TOKEN');
    expect(text).not.toContain('DEMO-PASSWORD');
    expect(text).toContain('[REDACTED]');
  });
});

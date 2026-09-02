import { safeOperationalError } from './redaction.mjs';

function requireFunction(value, name) {
  if (typeof value !== 'function') {
    throw new Error(`Backup worker dependency ${name} is unavailable.`);
  }
  return value;
}

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid operational timestamp.');
  return date;
}

export async function runBackupJob(input) {
  const jobId = String(input?.jobId ?? '').trim();
  if (!jobId) throw new Error('Backup job identifier is required.');

  const loadJob = requireFunction(input.loadJob, 'loadJob');
  const transition = requireFunction(input.transition, 'transition');
  const exportDatabase = requireFunction(input.exportDatabase, 'exportDatabase');
  const verifyIdentity = requireFunction(input.verifyIdentity, 'verifyIdentity');
  const exportStorage = requireFunction(input.exportStorage, 'exportStorage');
  const packageArchive = requireFunction(input.packageArchive, 'packageArchive');
  const verifyArchive = requireFunction(input.verifyArchive, 'verifyArchive');
  const storeArchive = requireFunction(input.storeArchive, 'storeArchive');
  const recordVerification = requireFunction(input.recordVerification, 'recordVerification');
  const cleanup = requireFunction(input.cleanup, 'cleanup');
  const log = typeof input.log === 'function' ? input.log : () => undefined;

  let currentStatus = 'QUEUED';

  try {
    const job = await loadJob(jobId);
    if (!job || job.status !== 'QUEUED') {
      throw new Error('Backup job is not queued for execution.');
    }

    await transition(jobId, 'QUEUED', 'RUNNING');
    currentStatus = 'RUNNING';

    const database = await exportDatabase(job);
    const identity = await verifyIdentity(job);
    if (!identity?.covered) {
      throw new Error('Identity recovery coverage is unavailable.');
    }
    const storage = await exportStorage(job);

    await transition(jobId, 'RUNNING', 'PACKAGING');
    currentStatus = 'PACKAGING';

    const artifact = await packageArchive({ job, database, identity, storage });

    await transition(jobId, 'PACKAGING', 'VERIFYING');
    currentStatus = 'VERIFYING';

    const verified = await verifyArchive(artifact);
    if (verified !== true) {
      throw new Error('Encrypted archive verification failed.');
    }

    await recordVerification(jobId, 'PASSED', {
      databaseBytes: database?.byteSize ?? null,
      storageBytes: storage?.byteSize ?? null,
      storageObjects: storage?.objectCount ?? null,
    });

    const stored = await storeArchive(artifact, job);
    await transition(jobId, 'VERIFYING', 'AVAILABLE', {
      archiveRef: stored?.ref ?? null,
      byteSize: stored?.byteSize ?? artifact?.byteSize ?? null,
      checksumSha256: stored?.checksumSha256 ?? artifact?.checksumSha256 ?? null,
    });
    currentStatus = 'AVAILABLE';

    return {
      status: 'AVAILABLE',
      archiveRef: stored?.ref ?? null,
    };
  } catch (error) {
    const safeMessage = safeOperationalError(error);
    log(`WASDOK-55 backup job ${jobId} failed: ${safeMessage}`);

    if (['QUEUED', 'RUNNING', 'PACKAGING', 'VERIFYING'].includes(currentStatus)) {
      try {
        await transition(jobId, currentStatus, 'FAILED', { failure: 'BACKUP_JOB_FAILED' });
      } catch (transitionError) {
        log(`WASDOK-55 failed-state transition error: ${safeOperationalError(transitionError)}`);
      }
    }

    throw new Error('Backup job failed.');
  } finally {
    await cleanup(jobId);
  }
}

export async function enqueueDueSchedules({ schedules, now = new Date(), enqueue }) {
  requireFunction(enqueue, 'enqueue');
  const currentTime = asDate(now).getTime();
  const seen = new Set();
  let count = 0;

  for (const schedule of schedules ?? []) {
    if (!schedule?.enabled) continue;
    const dueAt = asDate(schedule.nextRunAt);
    if (dueAt.getTime() > currentTime) continue;

    const idempotencyKey = `${schedule.id}:${dueAt.toISOString()}`;
    if (seen.has(idempotencyKey)) continue;
    seen.add(idempotencyKey);

    await enqueue({
      scheduleId: schedule.id,
      backupType: schedule.backupType,
      dueAt: dueAt.toISOString(),
      idempotencyKey,
    });
    count += 1;
  }

  return count;
}

export async function purgeExpiredArtifacts({ artifacts, policies, now = new Date(), purge }) {
  requireFunction(purge, 'purge');
  const currentTime = asDate(now).getTime();
  const policyMap = new Map((policies ?? []).map((policy) => [policy.id, policy]));
  let count = 0;

  for (const artifact of artifacts ?? []) {
    if (!artifact?.expiresAt) continue;
    if (asDate(artifact.expiresAt).getTime() > currentTime) continue;

    const policy = policyMap.get(artifact.retentionPolicyId);
    const active = policy?.enabled ?? policy?.isActive ?? policy?.is_active ?? false;
    const purgeEnabled = policy?.purgeEnabled ?? policy?.purge_enabled ?? false;
    if (!active || !purgeEnabled) continue;

    await purge(artifact);
    count += 1;
  }

  return count;
}

#!/usr/bin/env node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  enqueueDueSchedules,
  purgeExpiredArtifacts,
  runBackupJob,
} from './lib/backup-job-runner.mjs';
import { safeOperationalError } from './lib/redaction.mjs';

function parseArguments(argv) {
  const args = argv.slice(2);
  if (args[0] === '--job-id' && args[1] && args.length === 2) {
    return { mode: 'job', jobId: args[1] };
  }
  if (args.length === 1 && args[0] === '--enqueue-due-schedules') {
    return { mode: 'enqueue' };
  }
  if (args.length === 1 && args[0] === '--purge-expired') {
    return { mode: 'purge' };
  }
  throw new Error('Usage: backup-worker.mjs --job-id <uuid> | --enqueue-due-schedules | --purge-expired');
}

async function loadRuntime() {
  const modulePath = String(process.env.OCPNG_BACKUP_WORKER_RUNTIME_MODULE ?? '').trim();
  if (!modulePath) {
    throw new Error('Backup worker runtime adapter is not configured.');
  }

  const specifier = modulePath.startsWith('file:')
    ? modulePath
    : pathToFileURL(modulePath).href;
  const runtime = await import(specifier);
  if (typeof runtime.createBackupWorkerRuntime !== 'function') {
    throw new Error('Backup worker runtime adapter is invalid.');
  }
  return runtime.createBackupWorkerRuntime();
}

async function execute() {
  const command = parseArguments(process.argv);
  const runtime = await loadRuntime();

  if (command.mode === 'job') {
    const workDir = await mkdtemp(join(tmpdir(), 'wasdok55-backup-'));
    try {
      await runBackupJob({
        jobId: command.jobId,
        ...runtime.jobDependencies,
        workDir,
        cleanup: async (jobId) => {
          try {
            if (typeof runtime.jobDependencies?.cleanup === 'function') {
              await runtime.jobDependencies.cleanup(jobId);
            }
          } finally {
            await rm(workDir, { recursive: true, force: true });
          }
        },
      });
      return;
    } catch (error) {
      await rm(workDir, { recursive: true, force: true });
      throw error;
    }
  }

  if (command.mode === 'enqueue') {
    if (typeof runtime.listDueSchedules !== 'function' || typeof runtime.enqueueSchedule !== 'function') {
      throw new Error('Schedule worker runtime is unavailable.');
    }
    const schedules = await runtime.listDueSchedules();
    await enqueueDueSchedules({ schedules, enqueue: runtime.enqueueSchedule });
    return;
  }

  if (typeof runtime.listExpiredArtifacts !== 'function' || typeof runtime.listRetentionPolicies !== 'function' || typeof runtime.purgeArtifact !== 'function') {
    throw new Error('Retention worker runtime is unavailable.');
  }
  const [artifacts, policies] = await Promise.all([
    runtime.listExpiredArtifacts(),
    runtime.listRetentionPolicies(),
  ]);
  await purgeExpiredArtifacts({ artifacts, policies, purge: runtime.purgeArtifact });
}

execute().catch((error) => {
  console.error(`WASDOK-55 backup worker failed: ${safeOperationalError(error)}`);
  process.exitCode = 1;
});

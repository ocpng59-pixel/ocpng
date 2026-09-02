import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Task 9 contract: these modules intentionally do not exist at RED.
import {
  getBackupDetail,
  listBackupJobs,
  listBackupSchedules,
  listRecoveryPoints,
  listRetentionPolicies,
} from '@/lib/operations/backups/queries';
import {
  authorizeProductionRestore,
  requestBackup,
  requestDownload,
  requestProductionRestore,
  requestRestoreTest,
  upsertBackupSchedule,
  upsertRetentionPolicy,
} from '@/lib/operations/backups/mutations';

describe('WASDOK-55 backup administration domain adapters', () => {
  it('exports the approved query surface', () => {
    expect(listBackupJobs).toBeTypeOf('function');
    expect(getBackupDetail).toBeTypeOf('function');
    expect(listBackupSchedules).toBeTypeOf('function');
    expect(listRetentionPolicies).toBeTypeOf('function');
    expect(listRecoveryPoints).toBeTypeOf('function');
  });

  it('exports the approved mutation surface', () => {
    expect(requestBackup).toBeTypeOf('function');
    expect(requestDownload).toBeTypeOf('function');
    expect(upsertBackupSchedule).toBeTypeOf('function');
    expect(upsertRetentionPolicy).toBeTypeOf('function');
    expect(requestRestoreTest).toBeTypeOf('function');
    expect(requestProductionRestore).toBeTypeOf('function');
    expect(authorizeProductionRestore).toBeTypeOf('function');
  });

  it('keeps reads on the authenticated server client and mutations on approved RPCs', () => {
    const queries = readFileSync('lib/operations/backups/queries.ts', 'utf8');
    const mutations = readFileSync('lib/operations/backups/mutations.ts', 'utf8');

    expect(queries).toContain('createServerSupabaseClient');
    expect(queries).not.toContain('createServiceSupabaseClient');
    for (const table of [
      'backup_jobs',
      'backup_artifacts',
      'backup_verifications',
      'backup_schedules',
      'backup_retention_policies',
      'provider_recovery_points',
      'restore_runs',
      'restore_authorizations',
      'restore_verifications',
    ]) expect(queries).toContain(table);

    for (const rpc of [
      'request_backup',
      'request_backup_download',
      'admin_upsert_backup_schedule',
      'admin_upsert_retention_policy',
      'request_restore_test',
      'request_production_restore',
      'authorize_production_restore',
    ]) expect(mutations).toContain(rpc);
  });

  it('generates download grants server-side only after the audited download request', () => {
    const mutations = readFileSync('lib/operations/backups/mutations.ts', 'utf8');
    const requestIndex = mutations.indexOf('request_backup_download');
    const grantIndex = mutations.indexOf('createDownloadGrant');
    expect(requestIndex).toBeGreaterThan(-1);
    expect(grantIndex).toBeGreaterThan(requestIndex);
    expect(mutations).not.toMatch(/insert\([^)]*signedUrl|update\([^)]*signedUrl/i);
  });

  it('maps provider/database errors to safe operational messages', () => {
    const mutations = readFileSync('lib/operations/backups/mutations.ts', 'utf8');
    expect(mutations).toContain('mapBackupOperationError');
    expect(mutations).not.toMatch(/throw new Error\([^)]*\.message/);
  });
});

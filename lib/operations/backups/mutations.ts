import 'server-only';

import { getBackupOperationsConfiguration } from '@/lib/config/server-environment';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { SupabaseArchiveStore } from './providers/archive-store';

export type RequestBackupInput = { backupType: string; reason: string };
export type RequestDownloadInput = { backupId: string; reason: string };
export type BackupScheduleInput = {
  scheduleId?: string | null;
  backupType: string;
  cadence: string;
  retentionPolicyId?: string | null;
  enabled: boolean;
  reason: string;
};
export type RetentionPolicyInput = {
  policyId?: string | null;
  name: string;
  retentionDays: number;
  purgeEnabled: boolean;
  reason: string;
};
export type RestoreTestInput = { backupId: string; reason: string };
export type ProductionRestoreInput = { recoveryRef: string; recoveryTime: string; reason: string };
export type RestoreAuthorizationInput = { restoreId: string; reason: string };

function uuid(value: string | null | undefined): string | null {
  const clean = value?.trim() ?? '';
  return /^[0-9a-f-]{36}$/i.test(clean) ? clean : null;
}

function reason(value: string): string {
  const clean = value.trim();
  if (clean.length < 3 || clean.length > 500) throw new Error('Administrative reason must be 3 to 500 characters.');
  return clean;
}

export function mapBackupOperationError(code?: string | null): string {
  switch (code) {
    case '42501': return 'Backup or recovery permission denied.';
    case '22023': return 'The submitted backup or recovery request is invalid.';
    case '23505': return 'That backup or recovery request already exists.';
    case '23514': return 'The operation is blocked by a backup/recovery safeguard.';
    default: return 'The backup or recovery operation could not be completed.';
  }
}

async function rpc<T = string>(name: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error('Backup & Recovery is unavailable.');
  const result = await supabase.rpc(name, args);
  if (result.error) throw new Error(mapBackupOperationError(result.error.code));
  return result.data as T;
}

export async function requestBackup(input: RequestBackupInput): Promise<string> {
  return rpc<string>('request_backup', { p_backup_type: input.backupType, p_reason: reason(input.reason) });
}

export async function requestDownload(input: RequestDownloadInput): Promise<{ url: string; expiresAt: string }> {
  const backupId = uuid(input.backupId);
  if (!backupId) throw new Error('Invalid backup identifier.');

  // This audited RPC is the authoritative permission/reason gate and must occur
  // before any service-role artifact lookup or signed download grant generation.
  await rpc<string>('request_backup_download', { p_backup_id: backupId, p_reason: reason(input.reason) });

  const service = createServiceSupabaseClient();
  const artifactResult = await service.from('backup_artifacts')
    .select('storage_reference').eq('backup_id', backupId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const ref = typeof artifactResult.data?.storage_reference === 'string'
    ? artifactResult.data.storage_reference
    : null;
  if (artifactResult.error || !ref) throw new Error('No downloadable verified archive is available.');

  const { backupBucket } = getBackupOperationsConfiguration();
  const archiveStore = new SupabaseArchiveStore({ client: service, bucket: backupBucket });
  const expiresInSeconds = 300;
  const url = await archiveStore.createDownloadGrant(ref, expiresInSeconds);
  return { url, expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString() };
}

export async function upsertBackupSchedule(input: BackupScheduleInput): Promise<string> {
  return rpc<string>('admin_upsert_backup_schedule', {
    p_schedule_id: uuid(input.scheduleId),
    p_backup_type: input.backupType,
    p_cadence: input.cadence.trim(),
    p_retention_policy_id: uuid(input.retentionPolicyId),
    p_enabled: input.enabled,
    p_reason: reason(input.reason),
  });
}

export async function upsertRetentionPolicy(input: RetentionPolicyInput): Promise<string> {
  if (!Number.isSafeInteger(input.retentionDays) || input.retentionDays < 1 || input.retentionDays > 3650) {
    throw new Error('Retention days must be between 1 and 3650.');
  }
  return rpc<string>('admin_upsert_retention_policy', {
    p_policy_id: uuid(input.policyId),
    p_name: input.name.trim(),
    p_retention_days: input.retentionDays,
    p_purge_enabled: input.purgeEnabled,
    p_reason: reason(input.reason),
  });
}

export async function requestRestoreTest(input: RestoreTestInput): Promise<string> {
  const backupId = uuid(input.backupId);
  if (!backupId) throw new Error('Invalid backup identifier.');
  return rpc<string>('request_restore_test', { p_backup_id: backupId, p_reason: reason(input.reason) });
}

export async function requestProductionRestore(input: ProductionRestoreInput): Promise<string> {
  const when = new Date(input.recoveryTime);
  if (!input.recoveryRef.trim() || Number.isNaN(when.getTime())) throw new Error('A valid recovery point and time are required.');
  return rpc<string>('request_production_restore', {
    p_recovery_ref: input.recoveryRef.trim(),
    p_recovery_time: when.toISOString(),
    p_reason: reason(input.reason),
  });
}

export async function authorizeProductionRestore(input: RestoreAuthorizationInput): Promise<void> {
  const restoreId = uuid(input.restoreId);
  if (!restoreId) throw new Error('Invalid restore identifier.');
  await rpc<unknown>('authorize_production_restore', { p_restore_id: restoreId, p_reason: reason(input.reason) });
}

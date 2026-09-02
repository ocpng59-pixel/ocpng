import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ProviderRecoveryStatus } from './types';

export type BackupJobSummary = {
  id: string;
  backupCode: string;
  backupType: string;
  environment: string;
  status: string;
  requestedAt: string;
  completedAt: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
};

export type BackupArtifactView = {
  id: string;
  artifactType: string;
  byteSize: number | null;
  archiveChecksum: string | null;
  encryptionAlgorithm: string | null;
  recoveryDomains: Record<string, unknown>;
  createdAt: string;
};

export type BackupVerificationView = {
  id: string;
  status: string;
  verificationVersion: string;
  verifiedAt: string | null;
  safeMetadata: Record<string, unknown>;
};

export type BackupDetail = BackupJobSummary & {
  requestReason: string;
  safeMetadata: Record<string, unknown>;
  artifacts: BackupArtifactView[];
  verifications: BackupVerificationView[];
};

export type BackupScheduleView = {
  id: string;
  name: string;
  backupType: string;
  cadence: string;
  retentionPolicyId: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  nextRunAt: string | null;
};

export type RetentionPolicyView = {
  id: string;
  name: string;
  retentionDays: number;
  purgeEnabled: boolean;
  isActive: boolean;
};

type Row = Record<string, unknown>;

async function client() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error('Backup & Recovery is unavailable.');
  return supabase;
}

function text(row: Row, key: string): string {
  return typeof row[key] === 'string' ? row[key] : '';
}

function nullableText(row: Row, key: string): string | null {
  return typeof row[key] === 'string' ? row[key] as string : null;
}

function object(row: Row, key: string): Record<string, unknown> {
  const value = row[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mapJob(row: Row): BackupJobSummary {
  return {
    id: text(row, 'id'),
    backupCode: text(row, 'backup_code'),
    backupType: text(row, 'backup_type'),
    environment: text(row, 'environment'),
    status: text(row, 'status'),
    requestedAt: text(row, 'requested_at'),
    completedAt: nullableText(row, 'completed_at'),
    verifiedAt: nullableText(row, 'verified_at'),
    expiresAt: nullableText(row, 'expires_at'),
  };
}

export async function listBackupJobs(): Promise<BackupJobSummary[]> {
  const supabase = await client();
  const { data, error } = await supabase
    .from('backup_jobs')
    .select('id,backup_code,backup_type,environment,status,requested_at,completed_at,verified_at,expires_at')
    .order('requested_at', { ascending: false })
    .limit(100);
  if (error) return [];
  return ((data ?? []) as Row[]).map(mapJob);
}

export async function getBackupDetail(backupId: string): Promise<BackupDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(backupId)) return null;
  const supabase = await client();
  const [jobResult, artifactResult, verificationResult] = await Promise.all([
    supabase.from('backup_jobs')
      .select('id,backup_code,backup_type,environment,status,requested_at,completed_at,verified_at,expires_at,request_reason,safe_metadata')
      .eq('id', backupId).maybeSingle(),
    supabase.from('backup_artifacts')
      .select('id,artifact_type,byte_size,archive_checksum,encryption_algorithm,recovery_domains,created_at')
      .eq('backup_id', backupId).order('created_at', { ascending: false }),
    supabase.from('backup_verifications')
      .select('id,status,verification_version,verified_at,safe_metadata')
      .eq('backup_id', backupId).order('created_at', { ascending: false }),
  ]);
  if (jobResult.error || !jobResult.data) return null;
  const job = jobResult.data as Row;
  return {
    ...mapJob(job),
    requestReason: text(job, 'request_reason'),
    safeMetadata: object(job, 'safe_metadata'),
    artifacts: ((artifactResult.data ?? []) as Row[]).map((row) => ({
      id: text(row, 'id'), artifactType: text(row, 'artifact_type'),
      byteSize: typeof row.byte_size === 'number' ? row.byte_size : null,
      archiveChecksum: nullableText(row, 'archive_checksum'),
      encryptionAlgorithm: nullableText(row, 'encryption_algorithm'),
      recoveryDomains: object(row, 'recovery_domains'), createdAt: text(row, 'created_at'),
    })),
    verifications: ((verificationResult.data ?? []) as Row[]).map((row) => ({
      id: text(row, 'id'), status: text(row, 'status'),
      verificationVersion: text(row, 'verification_version'),
      verifiedAt: nullableText(row, 'verified_at'), safeMetadata: object(row, 'safe_metadata'),
    })),
  };
}

export async function listBackupSchedules(): Promise<BackupScheduleView[]> {
  const supabase = await client();
  const { data, error } = await supabase.from('backup_schedules')
    .select('id,name,backup_type,cadence,retention_policy_id,enabled,last_run_at,last_run_status,next_run_at')
    .order('name');
  if (error) return [];
  return ((data ?? []) as Row[]).map((row) => ({
    id: text(row, 'id'), name: text(row, 'name'), backupType: text(row, 'backup_type'),
    cadence: text(row, 'cadence'), retentionPolicyId: nullableText(row, 'retention_policy_id'),
    enabled: row.enabled === true, lastRunAt: nullableText(row, 'last_run_at'),
    lastRunStatus: nullableText(row, 'last_run_status'), nextRunAt: nullableText(row, 'next_run_at'),
  }));
}

export async function listRetentionPolicies(): Promise<RetentionPolicyView[]> {
  const supabase = await client();
  const { data, error } = await supabase.from('backup_retention_policies')
    .select('id,name,retention_days,purge_enabled,is_active').order('name');
  if (error) return [];
  return ((data ?? []) as Row[]).map((row) => ({
    id: text(row, 'id'), name: text(row, 'name'),
    retentionDays: typeof row.retention_days === 'number' ? row.retention_days : 0,
    purgeEnabled: row.purge_enabled === true, isActive: row.is_active === true,
  }));
}

export async function listRecoveryPoints(): Promise<ProviderRecoveryStatus> {
  const supabase = await client();
  const { data, error } = await supabase.from('provider_recovery_points')
    .select('provider,recovery_reference,recovery_kind,recovery_time,earliest_recovery_time,latest_recovery_time,available')
    .eq('available', true).order('recovery_time', { ascending: false }).limit(100);
  if (error) return { enabled: false, points: [], earliestRecoveryTime: null, latestRecoveryTime: null };
  const rows = (data ?? []) as Row[];
  const points = rows.map((row) => ({
    reference: text(row, 'recovery_reference'), kind: text(row, 'recovery_kind'),
    recoveryTime: nullableText(row, 'recovery_time'), earliestRecoveryTime: nullableText(row, 'earliest_recovery_time'),
    latestRecoveryTime: nullableText(row, 'latest_recovery_time'), available: row.available === true,
  }));
  return {
    enabled: points.length > 0,
    points,
    earliestRecoveryTime: points.map((point) => point.earliestRecoveryTime).find(Boolean) ?? null,
    latestRecoveryTime: points.map((point) => point.latestRecoveryTime).find(Boolean) ?? null,
  };
}

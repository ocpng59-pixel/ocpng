'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  authorizeProductionRestore,
  requestBackup,
  requestDownload,
  requestProductionRestore,
  requestRestoreTest,
  upsertBackupSchedule,
  upsertRetentionPolicy,
} from '@/lib/operations/backups/mutations';

function value(formData: FormData, key: string): string {
  const candidate = formData.get(key);
  return typeof candidate === 'string' ? candidate : '';
}

function refresh() {
  revalidatePath('/dashboard/operations/backups');
  revalidatePath('/dashboard/operations/backups/restore');
}

function safeError(error: unknown): string {
  if (error instanceof Error && error.message && error.message.length <= 180) return error.message;
  return 'The backup or recovery operation could not be completed.';
}

function returnWith(path: string, kind: 'notice' | 'error', message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

export async function requestBackupAction(formData: FormData): Promise<void> {
  try {
    await requestBackup({ backupType: value(formData, 'backupType'), reason: value(formData, 'reason') });
    refresh();
    returnWith('/dashboard/operations/backups', 'notice', 'Backup request recorded and queued for the operations worker.');
  } catch (error) {
    returnWith('/dashboard/operations/backups', 'error', safeError(error));
  }
}

export async function requestDownloadAction(formData: FormData): Promise<void> {
  try {
    const result = await requestDownload({ backupId: value(formData, 'backupId'), reason: value(formData, 'reason') });
    redirect(result.url);
  } catch (error) {
    returnWith('/dashboard/operations/backups', 'error', safeError(error));
  }
}

export async function upsertBackupScheduleAction(formData: FormData): Promise<void> {
  try {
    await upsertBackupSchedule({
      scheduleId: value(formData, 'scheduleId') || null,
      backupType: value(formData, 'backupType'),
      cadence: value(formData, 'cadence'),
      retentionPolicyId: value(formData, 'retentionPolicyId') || null,
      enabled: value(formData, 'enabled') === 'true',
      reason: value(formData, 'reason'),
    });
    refresh();
    returnWith('/dashboard/operations/backups', 'notice', 'Backup schedule saved.');
  } catch (error) {
    returnWith('/dashboard/operations/backups', 'error', safeError(error));
  }
}

export async function upsertRetentionPolicyAction(formData: FormData): Promise<void> {
  try {
    await upsertRetentionPolicy({
      policyId: value(formData, 'policyId') || null,
      name: value(formData, 'name'),
      retentionDays: Number.parseInt(value(formData, 'retentionDays'), 10),
      purgeEnabled: value(formData, 'purgeEnabled') === 'true',
      reason: value(formData, 'reason'),
    });
    refresh();
    returnWith('/dashboard/operations/backups', 'notice', 'Retention policy saved.');
  } catch (error) {
    returnWith('/dashboard/operations/backups', 'error', safeError(error));
  }
}

export async function requestRestoreTestAction(formData: FormData): Promise<void> {
  try {
    await requestRestoreTest({ backupId: value(formData, 'backupId'), reason: value(formData, 'reason') });
    refresh();
    returnWith('/dashboard/operations/backups/restore', 'notice', 'Restore rehearsal requested.');
  } catch (error) {
    returnWith('/dashboard/operations/backups/restore', 'error', safeError(error));
  }
}

export async function requestProductionRestoreAction(formData: FormData): Promise<void> {
  try {
    await requestProductionRestore({
      recoveryRef: value(formData, 'recoveryRef'),
      recoveryTime: value(formData, 'recoveryTime'),
      reason: value(formData, 'reason'),
    });
    refresh();
    returnWith('/dashboard/operations/backups/restore', 'notice', 'Production restore request recorded; independent authorization is still required.');
  } catch (error) {
    returnWith('/dashboard/operations/backups/restore', 'error', safeError(error));
  }
}

export async function authorizeProductionRestoreAction(formData: FormData): Promise<void> {
  try {
    await authorizeProductionRestore({ restoreId: value(formData, 'restoreId'), reason: value(formData, 'reason') });
    refresh();
    returnWith('/dashboard/operations/backups/restore', 'notice', 'Production restore authorization recorded.');
  } catch (error) {
    returnWith('/dashboard/operations/backups/restore', 'error', safeError(error));
  }
}

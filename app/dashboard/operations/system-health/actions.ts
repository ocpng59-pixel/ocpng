'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  acknowledgeHealthAlert,
  setHealthThreshold,
  setHealthThresholdActive,
} from '@/lib/operations/health/mutations';
import type { ThresholdDirection } from '@/lib/operations/health/types';

function value(formData: FormData, key: string): string {
  const candidate = formData.get(key);
  return typeof candidate === 'string' ? candidate : '';
}

function safeError(error: unknown): string {
  if (error instanceof Error && error.message && error.message.length <= 180) return error.message;
  return 'The System Health operation could not be completed.';
}

function refresh() {
  revalidatePath('/dashboard/operations/system-health');
  revalidatePath('/dashboard/operations/system-health/database');
  revalidatePath('/dashboard/operations/system-health/storage');
  revalidatePath('/dashboard/operations/system-health/backups');
  revalidatePath('/dashboard/operations/system-health/deployment');
  revalidatePath('/dashboard/operations/system-health/alerts');
}

function returnWith(kind: 'notice' | 'error', message: string): never {
  redirect(`/dashboard/operations/system-health/alerts?${kind}=${encodeURIComponent(message)}`);
}

export async function setHealthThresholdAction(formData: FormData): Promise<void> {
  try {
    await setHealthThreshold({
      metricCode: value(formData, 'metricCode'),
      warningValue: Number(value(formData, 'warningValue')),
      criticalValue: Number(value(formData, 'criticalValue')),
      direction: value(formData, 'direction') as ThresholdDirection,
      reason: value(formData, 'reason'),
    });
    refresh();
    returnWith('notice', 'System health threshold saved and audited.');
  } catch (error) {
    returnWith('error', safeError(error));
  }
}

export async function setHealthThresholdActiveAction(formData: FormData): Promise<void> {
  try {
    await setHealthThresholdActive({
      thresholdId: value(formData, 'thresholdId'),
      active: value(formData, 'active') === 'true',
      reason: value(formData, 'reason'),
    });
    refresh();
    returnWith('notice', 'System health threshold state updated and audited.');
  } catch (error) {
    returnWith('error', safeError(error));
  }
}

export async function acknowledgeHealthAlertAction(formData: FormData): Promise<void> {
  try {
    await acknowledgeHealthAlert({
      alertId: value(formData, 'alertId'),
      reason: value(formData, 'reason'),
    });
    refresh();
    returnWith('notice', 'System health alert acknowledged and audited.');
  } catch (error) {
    returnWith('error', safeError(error));
  }
}

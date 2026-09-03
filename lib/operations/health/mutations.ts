import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ThresholdDirection } from './types';

async function client() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error('System Health is unavailable.');
  return supabase;
}

function message(error: { message?: string } | null, fallback: string): string {
  if (error?.message && error.message.length <= 180) return error.message;
  return fallback;
}

export async function setHealthThreshold(input: {
  metricCode: string;
  warningValue: number;
  criticalValue: number;
  direction: ThresholdDirection;
  reason: string;
}): Promise<string> {
  const supabase = await client();
  const { data, error } = await supabase.rpc('admin_set_health_threshold', {
    p_metric_code: input.metricCode,
    p_warning: input.warningValue,
    p_critical: input.criticalValue,
    p_direction: input.direction,
    p_reason: input.reason,
  });
  if (error) throw new Error(message(error, 'The system health threshold could not be saved.'));
  return String(data ?? '');
}

export async function setHealthThresholdActive(input: {
  thresholdId: string;
  active: boolean;
  reason: string;
}): Promise<void> {
  const supabase = await client();
  const { error } = await supabase.rpc('admin_set_health_threshold_active', {
    p_threshold_id: input.thresholdId,
    p_active: input.active,
    p_reason: input.reason,
  });
  if (error) throw new Error(message(error, 'The system health threshold state could not be changed.'));
}

export async function acknowledgeHealthAlert(input: {
  alertId: string;
  reason: string;
}): Promise<void> {
  const supabase = await client();
  const { error } = await supabase.rpc('acknowledge_health_alert', {
    p_alert_id: input.alertId,
    p_reason: input.reason,
  });
  if (error) throw new Error(message(error, 'The system health alert could not be acknowledged.'));
}

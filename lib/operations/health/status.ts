import type {
  HealthStatus,
  MetricEvaluation,
  MetricSample,
  MetricThreshold,
} from '@/lib/operations/health/types';

function validThreshold(threshold: MetricThreshold): boolean {
  if (!Number.isFinite(threshold.warningValue) || !Number.isFinite(threshold.criticalValue)) {
    return false;
  }

  if (threshold.direction === 'ABOVE_IS_BAD') {
    return threshold.criticalValue > threshold.warningValue;
  }

  if (threshold.direction === 'BELOW_IS_BAD') {
    return threshold.criticalValue < threshold.warningValue;
  }

  return false;
}

export function evaluateMetricStatus(
  sample: MetricSample | null,
  threshold: MetricThreshold | null,
  nowIso: string,
): MetricEvaluation {
  if (!sample) {
    return { status: 'UNKNOWN', reason: 'NO_SAMPLE' };
  }

  const observedAt = Date.parse(sample.observedAt);
  const now = Date.parse(nowIso);
  if (
    !Number.isFinite(sample.value) ||
    !Number.isFinite(sample.staleAfterSeconds) ||
    sample.staleAfterSeconds <= 0 ||
    !Number.isFinite(observedAt) ||
    !Number.isFinite(now) ||
    observedAt > now
  ) {
    return { status: 'UNKNOWN', reason: 'INVALID_SAMPLE' };
  }

  if (now - observedAt > sample.staleAfterSeconds * 1000) {
    return { status: 'UNKNOWN', reason: 'STALE_SAMPLE' };
  }

  if (!threshold) {
    return { status: 'UNKNOWN', reason: 'NO_THRESHOLD' };
  }

  if (!validThreshold(threshold)) {
    return { status: 'UNKNOWN', reason: 'INVALID_THRESHOLD' };
  }

  if (threshold.direction === 'ABOVE_IS_BAD') {
    if (sample.value >= threshold.criticalValue) {
      return { status: 'CRITICAL', reason: 'CRITICAL_THRESHOLD' };
    }
    if (sample.value >= threshold.warningValue) {
      return { status: 'WARNING', reason: 'WARNING_THRESHOLD' };
    }
  } else {
    if (sample.value <= threshold.criticalValue) {
      return { status: 'CRITICAL', reason: 'CRITICAL_THRESHOLD' };
    }
    if (sample.value <= threshold.warningValue) {
      return { status: 'WARNING', reason: 'WARNING_THRESHOLD' };
    }
  }

  return { status: 'HEALTHY', reason: 'HEALTHY_RANGE' };
}

export function aggregateHealthStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes('CRITICAL')) return 'CRITICAL';
  if (statuses.includes('WARNING')) return 'WARNING';
  if (statuses.length === 0 || statuses.includes('UNKNOWN')) return 'UNKNOWN';
  return 'HEALTHY';
}

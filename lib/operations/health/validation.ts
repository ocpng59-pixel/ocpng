import { getHealthMetricDefinition } from '@/lib/operations/health/catalog';
import type { HealthMetricDefinition } from '@/lib/operations/health/types';

export function parseHealthTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isFiniteNonNegativeHealthValue(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function requireKnownHealthMetric(code: string): HealthMetricDefinition {
  const normalized = code.trim();
  const definition = getHealthMetricDefinition(normalized);
  if (!definition) {
    throw new Error('Unknown system health metric code.');
  }
  return definition;
}

export function validateHealthSourceLabel(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > 64 || !/^[a-zA-Z0-9._ -]+$/.test(normalized)) {
    throw new Error('Invalid system health source label.');
  }
  return normalized;
}

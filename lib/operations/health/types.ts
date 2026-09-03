export type HealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

export type ThresholdDirection = 'ABOVE_IS_BAD' | 'BELOW_IS_BAD';

export interface MetricSample {
  code: string;
  value: number;
  observedAt: string;
  staleAfterSeconds: number;
}

export interface MetricThreshold {
  warningValue: number;
  criticalValue: number;
  direction: ThresholdDirection;
}

export type MetricEvaluationReason =
  | 'HEALTHY_RANGE'
  | 'WARNING_THRESHOLD'
  | 'CRITICAL_THRESHOLD'
  | 'NO_SAMPLE'
  | 'STALE_SAMPLE'
  | 'NO_THRESHOLD'
  | 'INVALID_SAMPLE'
  | 'INVALID_THRESHOLD';

export interface MetricEvaluation {
  status: HealthStatus;
  reason: MetricEvaluationReason;
}

export interface CapacitySample {
  observedAt: string;
  value: number;
}

export interface CapacityForecast {
  status: 'AVAILABLE' | 'INSUFFICIENT_DATA';
  slopePerDay: number | null;
  projected30Days: number | null;
  projected180Days: number | null;
  projected365Days: number | null;
  sampleCount: number;
}

export type HealthMetricDomain =
  | 'application'
  | 'database'
  | 'storage'
  | 'backup'
  | 'deployment'
  | 'security';

export type HealthMetricUnit = 'bool' | 'ms' | 'ratio' | 'bytes' | 'count' | 'seconds';

export type HealthMetricValueType = 'BOOLEAN' | 'GAUGE' | 'RATIO' | 'COUNTER';

export interface HealthMetricDefinition {
  code: string;
  domain: HealthMetricDomain;
  unit: HealthMetricUnit;
  valueType: HealthMetricValueType;
  source: string;
  provider: string;
  staleAfterSeconds: number;
}

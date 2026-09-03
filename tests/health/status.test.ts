import { describe, expect, it } from 'vitest';
import {
  aggregateHealthStatus,
  evaluateMetricStatus,
} from '@/lib/operations/health/status';
import type { MetricSample, MetricThreshold } from '@/lib/operations/health/types';

const now = '2026-09-03T00:00:00.000Z';

function sample(overrides: Partial<MetricSample> = {}): MetricSample {
  return {
    code: 'db.database_bytes',
    value: 150,
    observedAt: '2026-09-02T23:59:30.000Z',
    staleAfterSeconds: 300,
    ...overrides,
  };
}

const aboveIsBad: MetricThreshold = {
  warningValue: 100,
  criticalValue: 200,
  direction: 'ABOVE_IS_BAD',
};

const belowIsBad: MetricThreshold = {
  warningValue: 100,
  criticalValue: 50,
  direction: 'BELOW_IS_BAD',
};

describe('WASDOK-85 health status and freshness', () => {
  it('reports missing data as UNKNOWN', () => {
    expect(evaluateMetricStatus(null, aboveIsBad, now)).toMatchObject({
      status: 'UNKNOWN',
      reason: 'NO_SAMPLE',
    });
  });

  it('reports stale data as UNKNOWN even when its numeric value would be healthy', () => {
    expect(
      evaluateMetricStatus(
        sample({ value: 10, observedAt: '2026-09-02T23:40:00.000Z', staleAfterSeconds: 300 }),
        aboveIsBad,
        now,
      ),
    ).toMatchObject({ status: 'UNKNOWN', reason: 'STALE_SAMPLE' });
  });

  it('reports fresh data without a configured threshold as UNKNOWN', () => {
    expect(evaluateMetricStatus(sample({ value: 10 }), null, now)).toMatchObject({
      status: 'UNKNOWN',
      reason: 'NO_THRESHOLD',
    });
  });

  it.each([
    [50, 'HEALTHY'],
    [100, 'WARNING'],
    [199.99, 'WARNING'],
    [200, 'CRITICAL'],
    [250, 'CRITICAL'],
  ] as const)('evaluates ABOVE_IS_BAD value %s as %s', (value, status) => {
    expect(evaluateMetricStatus(sample({ value }), aboveIsBad, now).status).toBe(status);
  });

  it.each([
    [150, 'HEALTHY'],
    [100, 'WARNING'],
    [75, 'WARNING'],
    [50, 'CRITICAL'],
    [25, 'CRITICAL'],
  ] as const)('evaluates BELOW_IS_BAD value %s as %s', (value, status) => {
    expect(evaluateMetricStatus(sample({ value }), belowIsBad, now).status).toBe(status);
  });

  it('gives CRITICAL precedence over WARNING and UNKNOWN in aggregate status', () => {
    expect(aggregateHealthStatus(['HEALTHY', 'UNKNOWN', 'WARNING', 'CRITICAL'])).toBe('CRITICAL');
  });

  it('gives WARNING precedence when no source is CRITICAL', () => {
    expect(aggregateHealthStatus(['HEALTHY', 'UNKNOWN', 'WARNING'])).toBe('WARNING');
  });

  it('never coerces UNKNOWN-only or empty aggregate state to HEALTHY', () => {
    expect(aggregateHealthStatus(['HEALTHY', 'UNKNOWN'])).toBe('UNKNOWN');
    expect(aggregateHealthStatus([])).toBe('UNKNOWN');
  });

  it('treats malformed timestamps or invalid freshness windows as UNKNOWN', () => {
    expect(evaluateMetricStatus(sample({ observedAt: 'not-a-date' }), aboveIsBad, now).status).toBe(
      'UNKNOWN',
    );
    expect(evaluateMetricStatus(sample({ staleAfterSeconds: 0 }), aboveIsBad, now).status).toBe(
      'UNKNOWN',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { forecastCapacity } from '@/lib/operations/health/forecast';
import type { CapacitySample } from '@/lib/operations/health/types';

const asOf = '2026-09-03T00:00:00.000Z';

function dailySeries(values: number[], start = '2026-08-27T00:00:00.000Z'): CapacitySample[] {
  const startMs = Date.parse(start);
  return values.map((value, index) => ({
    observedAt: new Date(startMs + index * 86_400_000).toISOString(),
    value,
  }));
}

describe('WASDOK-85 deterministic capacity forecasting', () => {
  it('returns INSUFFICIENT_DATA with fewer than seven distinct days', () => {
    expect(forecastCapacity(dailySeries([100, 110, 120, 130, 140, 150]), asOf)).toEqual({
      status: 'INSUFFICIENT_DATA',
      slopePerDay: null,
      projected30Days: null,
      projected180Days: null,
      projected365Days: null,
      sampleCount: 6,
    });
  });

  it('requires seven distinct days rather than seven same-day points', () => {
    const sameDay = Array.from({ length: 7 }, (_, index) => ({
      observedAt: `2026-09-02T0${index}:00:00.000Z`,
      value: 100 + index,
    }));
    expect(forecastCapacity(sameDay, asOf).status).toBe('INSUFFICIENT_DATA');
    expect(forecastCapacity(sameDay, asOf).sampleCount).toBe(1);
  });

  it('uses ordinary least-squares slope over daily observations', () => {
    const result = forecastCapacity(dailySeries([100, 110, 120, 130, 140, 150, 160]), asOf);
    expect(result.status).toBe('AVAILABLE');
    expect(result.sampleCount).toBe(7);
    expect(result.slopePerDay).toBeCloseTo(10, 8);
    expect(result.projected30Days).toBeCloseTo(460, 8);
    expect(result.projected180Days).toBeCloseTo(1960, 8);
    expect(result.projected365Days).toBeCloseTo(3810, 8);
  });

  it('ignores samples outside the 90-day lookback window', () => {
    const recent = dailySeries([100, 110, 120, 130, 140, 150, 160]);
    const withOldOutlier: CapacitySample[] = [
      { observedAt: '2026-01-01T00:00:00.000Z', value: 9_999_999 },
      ...recent,
    ];
    const result = forecastCapacity(withOldOutlier, asOf);
    expect(result.sampleCount).toBe(7);
    expect(result.slopePerDay).toBeCloseTo(10, 8);
  });

  it('uses only finite non-negative observed capacity values', () => {
    const samples = [
      ...dailySeries([100, 110, 120, 130, 140, 150, 160]),
      { observedAt: '2026-09-02T12:00:00.000Z', value: Number.NaN },
      { observedAt: '2026-09-02T13:00:00.000Z', value: -5 },
    ];
    const result = forecastCapacity(samples, asOf);
    expect(result.status).toBe('AVAILABLE');
    expect(result.sampleCount).toBe(7);
    expect(result.slopePerDay).toBeCloseTo(10, 8);
  });

  it('clamps negative projected capacity to zero', () => {
    const result = forecastCapacity(dailySeries([700, 600, 500, 400, 300, 200, 100]), asOf);
    expect(result.status).toBe('AVAILABLE');
    expect(result.slopePerDay).toBeCloseTo(-100, 8);
    expect(result.projected30Days).toBe(0);
    expect(result.projected180Days).toBe(0);
    expect(result.projected365Days).toBe(0);
  });

  it('is deterministic and exposes no model/AI confidence field', () => {
    const samples = dailySeries([100, 112, 121, 133, 144, 158, 169]);
    const first = forecastCapacity(samples, asOf);
    const second = forecastCapacity(samples, asOf);
    expect(second).toEqual(first);
    expect(first).not.toHaveProperty('confidence');
    expect(first).not.toHaveProperty('model');
  });
});

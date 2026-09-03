import type { CapacityForecast, CapacitySample } from '@/lib/operations/health/types';

const DAY_MS = 86_400_000;
const LOOKBACK_DAYS = 90;
const MIN_DISTINCT_DAYS = 7;

function insufficient(sampleCount: number): CapacityForecast {
  return {
    status: 'INSUFFICIENT_DATA',
    slopePerDay: null,
    projected30Days: null,
    projected180Days: null,
    projected365Days: null,
    sampleCount,
  };
}

function utcDayStart(timestampMs: number): number {
  const date = new Date(timestampMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function forecastCapacity(samples: CapacitySample[], asOfIso: string): CapacityForecast {
  const asOf = Date.parse(asOfIso);
  if (!Number.isFinite(asOf)) return insufficient(0);

  const cutoff = asOf - LOOKBACK_DAYS * DAY_MS;
  const latestPerDay = new Map<number, { observedAt: number; value: number }>();

  for (const sample of samples) {
    const observedAt = Date.parse(sample.observedAt);
    if (
      !Number.isFinite(observedAt) ||
      observedAt > asOf ||
      observedAt < cutoff ||
      !Number.isFinite(sample.value) ||
      sample.value < 0
    ) {
      continue;
    }

    const day = utcDayStart(observedAt);
    const existing = latestPerDay.get(day);
    if (!existing || observedAt > existing.observedAt) {
      latestPerDay.set(day, { observedAt, value: sample.value });
    }
  }

  const daily = [...latestPerDay.entries()]
    .sort(([left], [right]) => left - right)
    .map(([day, sample]) => ({ day, value: sample.value }));

  if (daily.length < MIN_DISTINCT_DAYS) return insufficient(daily.length);

  const origin = daily[0].day;
  const points = daily.map(({ day, value }) => ({
    x: (day - origin) / DAY_MS,
    y: value,
  }));

  const meanX = points.reduce((total, point) => total + point.x, 0) / points.length;
  const meanY = points.reduce((total, point) => total + point.y, 0) / points.length;
  const numerator = points.reduce(
    (total, point) => total + (point.x - meanX) * (point.y - meanY),
    0,
  );
  const denominator = points.reduce(
    (total, point) => total + (point.x - meanX) ** 2,
    0,
  );

  if (!Number.isFinite(denominator) || denominator <= 0) return insufficient(daily.length);

  const slopePerDay = numerator / denominator;
  const intercept = meanY - slopePerDay * meanX;
  const latestX = points[points.length - 1].x;
  const project = (days: number) => Math.max(0, intercept + slopePerDay * (latestX + days));

  return {
    status: 'AVAILABLE',
    slopePerDay,
    projected30Days: project(30),
    projected180Days: project(180),
    projected365Days: project(365),
    sampleCount: daily.length,
  };
}

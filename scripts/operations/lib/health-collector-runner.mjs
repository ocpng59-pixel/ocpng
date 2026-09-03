export const HEALTH_COLLECTOR_ALLOWED_METRIC_CODES = Object.freeze([]);

export async function runHealthCollector() {
  return {
    status: 'NOT_IMPLEMENTED',
    collectedSources: 0,
    unknownSources: [],
  };
}

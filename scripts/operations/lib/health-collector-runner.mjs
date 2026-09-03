const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;
const SAFE_UNKNOWN_REASONS = new Set([
  'AUTHENTICATION_FAILED',
  'AUTHORIZATION_FAILED',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_ERROR',
]);

export const HEALTH_COLLECTOR_ALLOWED_METRIC_CODES = Object.freeze([
  'app.availability',
  'app.response_latency_ms',
  'app.http_error_rate',
  'db.database_bytes',
  'db.disk_bytes',
  'db.wal_bytes',
  'db.connections_active',
  'db.connections_max',
  'db.long_running_queries',
  'db.deadlocks_24h',
  'storage.object_count',
  'storage.bytes',
  'backup.last_verified_age_seconds',
  'backup.last_restore_rehearsal_age_seconds',
  'deployment.schema_drift',
  'security.failed_privileged_ops_24h',
  'security.failed_logins_24h',
  'security.advisor_warning_count',
]);

const ALLOWED_METRIC_CODES = new Set(HEALTH_COLLECTOR_ALLOWED_METRIC_CODES);

function requireFunction(value, name) {
  if (typeof value !== 'function') {
    throw new Error(`Health collector dependency ${name} is unavailable.`);
  }
  return value;
}

function normalizeSource(value) {
  const source = String(value ?? '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(source)) {
    throw new Error('Health collector source identifier is invalid.');
  }
  return source;
}

function normalizeTimeout(value) {
  const timeout = value ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  if (!Number.isInteger(timeout) || timeout <= 0 || timeout > 60_000) {
    throw new Error('Health collector provider timeout is invalid.');
  }
  return timeout;
}

function nowIso(now) {
  const date = requireFunction(now, 'now')();
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Health collector clock returned an invalid timestamp.');
  }
  return date.toISOString();
}

export function normalizeHealthProviderMetrics(metrics) {
  if (!Array.isArray(metrics)) return [];

  const normalized = [];
  const seen = new Set();
  for (const metric of metrics) {
    const code = typeof metric?.code === 'string' ? metric.code.trim() : '';
    const value = metric?.value;
    if (!ALLOWED_METRIC_CODES.has(code)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    normalized.push({ metric_code: code, value });
  }
  return normalized;
}

function unknownSnapshot(source, reason) {
  return {
    source,
    status: 'UNKNOWN',
    metrics: [],
    reason: SAFE_UNKNOWN_REASONS.has(reason) ? reason : 'PROVIDER_ERROR',
  };
}

function normalizeCollectedSnapshot(source, snapshot) {
  if (!snapshot || snapshot.status !== 'AVAILABLE') {
    return unknownSnapshot(source, snapshot?.reason);
  }

  const metrics = normalizeHealthProviderMetrics(snapshot.metrics);
  if (metrics.length === 0) {
    return unknownSnapshot(source, 'PROVIDER_ERROR');
  }

  return { source, status: 'AVAILABLE', metrics };
}

async function collectProvider(descriptor, timeoutMs) {
  const source = normalizeSource(descriptor?.source);
  const collect = requireFunction(descriptor?.provider?.collect, `${source}.collect`).bind(descriptor.provider);
  let timer;

  const collection = Promise.resolve()
    .then(() => collect())
    .then(
      (snapshot) => ({ kind: 'result', snapshot }),
      () => ({ kind: 'error' }),
    );

  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
  });

  try {
    const outcome = await Promise.race([collection, timeout]);
    if (outcome.kind === 'timeout') {
      return unknownSnapshot(source, 'PROVIDER_UNAVAILABLE');
    }
    if (outcome.kind === 'error') {
      return unknownSnapshot(source, 'PROVIDER_ERROR');
    }
    return normalizeCollectedSnapshot(source, outcome.snapshot);
  } finally {
    clearTimeout(timer);
  }
}

export async function runHealthCollector(input = {}) {
  const providers = Array.isArray(input.providers) ? input.providers : [];
  if (providers.length === 0) {
    throw new Error('Health collector requires at least one provider.');
  }

  const recordSnapshot = requireFunction(input.recordSnapshot, 'recordSnapshot');
  const now = typeof input.now === 'function' ? input.now : () => new Date();
  const providerTimeoutMs = normalizeTimeout(input.providerTimeoutMs);

  const collected = await Promise.all(
    providers.map((descriptor) => collectProvider(descriptor, providerTimeoutMs)),
  );
  const observedAt = nowIso(now);

  for (const snapshot of collected) {
    const safeMetadata = snapshot.status === 'AVAILABLE'
      ? { collector: 'WASDOK-85', provider_status: 'AVAILABLE' }
      : {
          collector: 'WASDOK-85',
          provider_status: 'UNKNOWN',
          reason: snapshot.reason,
        };

    try {
      await recordSnapshot({
        source: snapshot.source,
        observedAt,
        metrics: snapshot.metrics,
        safeMetadata,
      });
    } catch {
      throw new Error('Health collector snapshot persistence failed.');
    }
  }

  const unknownSources = collected
    .filter((snapshot) => snapshot.status === 'UNKNOWN')
    .map((snapshot) => snapshot.source);

  return {
    status: unknownSources.length > 0 ? 'COMPLETED_WITH_UNKNOWN' : 'COMPLETED',
    collectedSources: collected.length,
    unknownSources,
  };
}

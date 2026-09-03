const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;
const SAFE_UNKNOWN_REASONS = new Set([
  'AUTHENTICATION_FAILED',
  'AUTHORIZATION_FAILED',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_ERROR',
]);
const SAFE_HEALTH_STATUSES = new Set(['HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN']);

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

function normalizeOptionalIdentifier(value, pattern, maxLength, name) {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim();
  if (normalized.length > maxLength || !pattern.test(normalized)) {
    throw new Error(`Health collector deployment ${name} is invalid.`);
  }
  return normalized;
}

function normalizeDeploymentState(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Health collector deployment state is invalid.');
  }

  const environment = String(value.environment ?? '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(environment)) {
    throw new Error('Health collector deployment environment is invalid.');
  }

  const expectedSchemaVersion = String(value.expectedSchemaVersion ?? '').trim();
  if (!/^\d{14}$/.test(expectedSchemaVersion)) {
    throw new Error('Health collector expected schema version is invalid.');
  }

  const appliedSchemaVersion = normalizeOptionalIdentifier(
    value.appliedSchemaVersion,
    /^\d{14}$/,
    14,
    'applied schema version',
  );
  const deployedCommit = normalizeOptionalIdentifier(
    value.deployedCommit,
    /^[A-Fa-f0-9]{7,64}$/,
    64,
    'commit identifier',
  );
  const releaseId = normalizeOptionalIdentifier(
    value.releaseId,
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/,
    128,
    'release identifier',
  );
  const status = String(value.status ?? '').trim().toUpperCase();
  if (!SAFE_HEALTH_STATUSES.has(status)) {
    throw new Error('Health collector deployment status is invalid.');
  }

  const observed = new Date(String(value.observedAt ?? ''));
  if (Number.isNaN(observed.getTime())) {
    throw new Error('Health collector deployment observation time is invalid.');
  }

  return {
    environment,
    ...(deployedCommit ? { deployedCommit } : {}),
    ...(releaseId ? { releaseId } : {}),
    expectedSchemaVersion,
    ...(appliedSchemaVersion ? { appliedSchemaVersion } : {}),
    status,
    source: 'deployment',
    provider: 'wasdok',
    observedAt: observed.toISOString(),
  };
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

async function withTimeout(operation, timeoutMs) {
  let timer;
  const work = Promise.resolve().then(operation).then(
    (value) => ({ kind: 'result', value }),
    () => ({ kind: 'error' }),
  );
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function collectProvider(descriptor, timeoutMs) {
  const source = normalizeSource(descriptor?.source);
  const collect = requireFunction(descriptor?.provider?.collect, `${source}.collect`).bind(descriptor.provider);
  const outcome = await withTimeout(() => collect(), timeoutMs);
  if (outcome.kind === 'timeout') return unknownSnapshot(source, 'PROVIDER_UNAVAILABLE');
  if (outcome.kind === 'error') return unknownSnapshot(source, 'PROVIDER_ERROR');
  return normalizeCollectedSnapshot(source, outcome.value);
}

async function collectDeploymentState(descriptor, timeoutMs) {
  if (!descriptor || normalizeSource(descriptor.source) !== 'deployment') {
    return { state: null, reason: null };
  }
  if (typeof descriptor.provider?.collectDeploymentState !== 'function') {
    return { state: null, reason: null };
  }

  const collect = descriptor.provider.collectDeploymentState.bind(descriptor.provider);
  const outcome = await withTimeout(() => collect(), timeoutMs);
  if (outcome.kind === 'timeout') {
    return { state: null, reason: 'PROVIDER_UNAVAILABLE' };
  }
  if (outcome.kind === 'error') {
    return { state: null, reason: 'PROVIDER_ERROR' };
  }

  try {
    return { state: normalizeDeploymentState(outcome.value), reason: null };
  } catch {
    return { state: null, reason: 'PROVIDER_ERROR' };
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
  const deploymentDescriptor = providers.find(
    (descriptor) => descriptor?.source === 'deployment'
      && typeof descriptor?.provider?.collectDeploymentState === 'function',
  );
  const recordDeploymentState = deploymentDescriptor
    ? requireFunction(input.recordDeploymentState, 'recordDeploymentState')
    : null;

  const [collectedSnapshots, deploymentCollection] = await Promise.all([
    Promise.all(providers.map((descriptor) => collectProvider(descriptor, providerTimeoutMs))),
    deploymentDescriptor
      ? collectDeploymentState(deploymentDescriptor, providerTimeoutMs)
      : Promise.resolve({ state: null, reason: null }),
  ]);

  const collected = deploymentCollection.reason
    ? collectedSnapshots.map((snapshot) => (
        snapshot.source === 'deployment'
          ? unknownSnapshot('deployment', deploymentCollection.reason)
          : snapshot
      ))
    : collectedSnapshots;
  const deploymentState = deploymentCollection.state;
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

  if (deploymentState && recordDeploymentState) {
    try {
      await recordDeploymentState(deploymentState);
    } catch {
      throw new Error('Health collector deployment state persistence failed.');
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

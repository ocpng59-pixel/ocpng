const CONFIGURATION_ERROR = 'System health runtime configuration is unavailable.';

function clean(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function isHttpsUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function isLegacyServiceRoleJwt(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return false;

  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return decoded?.role === 'service_role';
  } catch {
    return false;
  }
}

function isServiceRoleKey(value) {
  return value.startsWith('sb_secret_') || isLegacyServiceRoleJwt(value);
}

function isProjectRef(value) {
  return /^[a-z0-9]{20}$/.test(value);
}

function isHealthToken(value) {
  return value.length >= 24 && value.length <= 512 && /^[A-Za-z0-9._~-]+$/.test(value);
}

function isCommit(value) {
  return /^[A-Fa-f0-9]{7,64}$/.test(value);
}

function isReleaseId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

export function getHealthRuntimeConfiguration(source = process.env) {
  const supabaseUrl = clean(source.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = clean(source.SUPABASE_SERVICE_ROLE_KEY);
  const projectRef = clean(source.OCPNG_SUPABASE_PROJECT_REF);
  const healthToken = clean(source.OCPNG_SUPABASE_HEALTH_TOKEN);
  const publicAppUrl = clean(source.OCPNG_PUBLIC_APP_URL);
  const deployedCommit = clean(source.OCPNG_DEPLOYED_COMMIT);
  const releaseId = clean(source.OCPNG_RELEASE_ID);

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !projectRef ||
    !healthToken ||
    !publicAppUrl ||
    !isHttpsUrl(supabaseUrl) ||
    !isServiceRoleKey(serviceRoleKey) ||
    !isProjectRef(projectRef) ||
    !isHealthToken(healthToken) ||
    !isHttpsUrl(publicAppUrl) ||
    (deployedCommit !== null && !isCommit(deployedCommit)) ||
    (releaseId !== null && !isReleaseId(releaseId))
  ) {
    throw new Error(CONFIGURATION_ERROR);
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    projectRef,
    healthToken,
    publicAppUrl,
    environment: 'production',
    ...(deployedCommit ? { deployedCommit } : {}),
    ...(releaseId ? { releaseId } : {}),
  };
}

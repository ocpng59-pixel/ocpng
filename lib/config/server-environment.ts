type EnvironmentSource = Record<string, string | undefined>;

export type ServiceSupabaseConfiguration = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

export type BackupOperationsConfiguration = {
  projectRef: string;
  managementToken: string;
  databaseUrl: string;
  backupBucket: string;
  keyRef: string;
};

const clean = (value: string | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const runtimeEnvironment = (): EnvironmentSource =>
  (globalThis as { process?: { env?: EnvironmentSource } }).process?.env ?? {};

function isLegacyServiceRoleJwt(key: string): boolean {
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return decoded?.role === 'service_role';
  } catch {
    return false;
  }
}

function isServiceRoleKey(key: string): boolean {
  return key.startsWith('sb_secret_') || isLegacyServiceRoleJwt(key);
}

function isProjectRef(value: string): boolean {
  return /^[a-z0-9]{20}$/.test(value);
}

function isManagementToken(value: string): boolean {
  return value.startsWith('sbp_') && value.length >= 24 && /^[A-Za-z0-9_-]+$/.test(value);
}

function isPostgresUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function isBackupBucket(value: string): boolean {
  return value.length >= 3 && value.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value);
}

function isKeyReference(value: string): boolean {
  return /^(?:kms|vault):\/\/[A-Za-z0-9._~!$&'()*+,;=:@/-]+$/.test(value);
}

export function isComplaintSubmissionEnabled(
  source: EnvironmentSource = runtimeEnvironment(),
): boolean {
  return source.OCPNG_COMPLAINT_SUBMISSION_ENABLED === 'true';
}

export function getServiceSupabaseConfiguration(
  source: EnvironmentSource = runtimeEnvironment(),
): ServiceSupabaseConfiguration {
  const supabaseUrl = clean(source.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = clean(source.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey || !isServiceRoleKey(serviceRoleKey)) {
    throw new Error('Privileged Supabase server configuration is unavailable.');
  }

  return { supabaseUrl, serviceRoleKey };
}

export function getBackupOperationsConfiguration(
  source: EnvironmentSource = runtimeEnvironment(),
): BackupOperationsConfiguration {
  const projectRef = clean(source.OCPNG_SUPABASE_PROJECT_REF);
  const managementToken = clean(source.OCPNG_SUPABASE_MANAGEMENT_TOKEN);
  const databaseUrl = clean(source.OCPNG_BACKUP_DATABASE_URL);
  const backupBucket = clean(source.OCPNG_BACKUP_BUCKET);
  const keyRef = clean(source.OCPNG_BACKUP_KEY_REF);

  if (
    !projectRef ||
    !managementToken ||
    !databaseUrl ||
    !backupBucket ||
    !keyRef ||
    !isProjectRef(projectRef) ||
    !isManagementToken(managementToken) ||
    !isPostgresUrl(databaseUrl) ||
    !isBackupBucket(backupBucket) ||
    !isKeyReference(keyRef)
  ) {
    throw new Error('Backup operations server configuration is unavailable.');
  }

  return { projectRef, managementToken, databaseUrl, backupBucket, keyRef };
}

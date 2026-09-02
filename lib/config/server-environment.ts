type EnvironmentSource = Record<string, string | undefined>;

export type ServiceSupabaseConfiguration = {
  supabaseUrl: string;
  serviceRoleKey: string;
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

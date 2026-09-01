export type AppEnvironment = 'development' | 'test' | 'uat' | 'production';

export interface PublicEnvironment {
  appEnv: AppEnvironment;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  strict: boolean;
}

type EnvironmentSource = Record<string, string | undefined>;

const clean = (value: string | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const runtimeEnvironment = (): EnvironmentSource =>
  (globalThis as { process?: { env?: EnvironmentSource } }).process?.env ?? {};

function isPrivilegedKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    // Decode only to reject a misconfigured key, never to establish identity.
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))).role === 'service_role';
  } catch {
    return false;
  }
}

export function getPublicEnvironment(source: EnvironmentSource = runtimeEnvironment()): PublicEnvironment {
  const appEnv = (clean(source.NEXT_PUBLIC_APP_ENV) ?? 'development') as AppEnvironment;
  const supabaseUrl = clean(source.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = clean(source.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const strict = source.OCPNG_STRICT_ENV === 'true';
  const deployedEnvironment = appEnv === 'uat' || appEnv === 'production';
  const requiresSupabase = strict || deployedEnvironment;

  if (supabaseAnonKey && isPrivilegedKey(supabaseAnonKey)) {
    throw new Error('Supabase public configuration must use an anonymous or publishable key, never a privileged key.');
  }

  if (requiresSupabase && (!supabaseUrl || !supabaseAnonKey)) {
    throw new Error(
      `Supabase public configuration is required for ${appEnv} when strict or deployed environment controls are active.`,
    );
  }

  return { appEnv, supabaseUrl, supabaseAnonKey, strict };
}

export function isSupabaseConfigured(source: EnvironmentSource = runtimeEnvironment()): boolean {
  const env = getPublicEnvironment({ ...source, OCPNG_STRICT_ENV: 'false' });
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

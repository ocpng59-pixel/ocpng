import { describe, expect, it } from 'vitest';
import { getPublicEnvironment, isSupabaseConfigured } from '@/lib/config/environment';

describe('public environment', () => {
  it('allows local builds without Supabase secrets when strict mode is disabled', () => {
    const env = getPublicEnvironment({
      NEXT_PUBLIC_APP_ENV: 'development',
      OCPNG_STRICT_ENV: 'false',
    });
    expect(env.appEnv).toBe('development');
    expect(env.supabaseUrl).toBeNull();
    expect(env.supabaseAnonKey).toBeNull();
  });

  it('reports Supabase as unconfigured when public credentials are missing', () => {
    expect(isSupabaseConfigured({})).toBe(false);
  });

  it('requires public Supabase configuration only in strict mode', () => {
    expect(() => getPublicEnvironment({ OCPNG_STRICT_ENV: 'true' })).toThrow(/Supabase/i);
  });
});

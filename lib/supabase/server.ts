import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPublicEnvironment } from '@/lib/config/environment';

export function createServerSupabaseClient(): SupabaseClient | null {
  const env = getPublicEnvironment({
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    OCPNG_STRICT_ENV: process.env.OCPNG_STRICT_ENV,
  });
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  return createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

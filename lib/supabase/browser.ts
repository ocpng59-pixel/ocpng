import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPublicEnvironment } from '@/lib/config/environment';

let browserClient: SupabaseClient | null | undefined;
export function createBrowserSupabaseClient(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  const env = getPublicEnvironment({
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    OCPNG_STRICT_ENV: process.env.OCPNG_STRICT_ENV,
  });
  browserClient = env.supabaseUrl && env.supabaseAnonKey ? createClient(env.supabaseUrl, env.supabaseAnonKey) : null;
  return browserClient;
}

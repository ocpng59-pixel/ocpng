import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { getServiceSupabaseConfiguration } from '@/lib/config/server-environment';

export function createServiceSupabaseClient() {
  const { supabaseUrl, serviceRoleKey } = getServiceSupabaseConfiguration();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

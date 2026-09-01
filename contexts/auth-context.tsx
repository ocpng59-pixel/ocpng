'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { shouldReturnToLoginAfterAuthEvent } from '@/lib/auth/session-lifecycle';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';

type AuthState = { session: Session | null; configured: boolean; loading: boolean };
const AuthContext = createContext<AuthState>({ session: null, configured: false, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(client));

  useEffect(() => {
    if (!client) return;

    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((event, next) => {
      setSession(next);

      if (
        shouldReturnToLoginAfterAuthEvent({
          event,
          hasSession: Boolean(next),
          pathname: window.location.pathname,
        })
      ) {
        window.location.assign('/login');
      }
    });

    return () => data.subscription.unsubscribe();
  }, [client]);

  return <AuthContext.Provider value={{ session, configured: Boolean(client), loading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

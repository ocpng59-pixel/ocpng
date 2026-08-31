'use client';

import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/contexts/auth-context';

export function AuthGate({ children }: { children: ReactNode }) {
  const { configured, loading, session } = useAuth();
  useEffect(() => {
    if (configured && !loading && !session) window.location.replace('/login');
  }, [configured, loading, session]);
  if (configured && (loading || !session)) return <div className="oc-auth-wrap"><div className="oc-auth-card"><h1>Authorising access</h1><p className="oc-muted">Validating your OCPNG session and access context.</p></div></div>;
  return <>{children}</>;
}

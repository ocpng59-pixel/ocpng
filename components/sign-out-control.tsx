'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { recordAuthenticatedAuthEvent } from '@/lib/auth/audit';
import { signOutCurrentSession } from '@/lib/auth/session-lifecycle';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';

export function SignOutControl() {
  const client = createBrowserSupabaseClient();
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSignOut() {
    if (!client || !session || busy) return;

    setBusy(true);
    setMessage('');

    const result = await signOutCurrentSession({
      actorId: session?.user.id,
      pathname: window.location.pathname,
      recordAudit: (auditEvent) =>
        recordAuthenticatedAuthEvent({
          ...auditEvent,
          insert: async (row) => {
            const { error } = await client.from('audit_events').insert(row);
            return { error: error ? { message: error.message } : null };
          },
        }),
      signOut: (options) => client.auth.signOut(options),
      redirect: (path) => window.location.assign(path),
    });

    if (!result.ok) {
      setMessage(result.message);
      setBusy(false);
    }
  }

  return (
    <div className="oc-session-control">
      <button
        type="button"
        className="oc-button oc-button-compact"
        disabled={!client || !session || busy}
        onClick={handleSignOut}
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      {message ? <span className="oc-session-error">{message}</span> : null}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { signOutCurrentSession } from '@/lib/auth/session-lifecycle';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';

export function SignOutControl() {
  const client = createBrowserSupabaseClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSignOut() {
    if (!client || busy) return;

    setBusy(true);
    setMessage('');

    const result = await signOutCurrentSession({
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
        disabled={!client || busy}
        onClick={handleSignOut}
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      {message ? <span className="oc-session-error">{message}</span> : null}
    </div>
  );
}

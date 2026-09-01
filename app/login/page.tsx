'use client';

import Link from 'next/link';
import { useState } from 'react';
import { recordAuthenticatedAuthEvent } from '@/lib/auth/audit';
import { signInCurrentSession } from '@/lib/auth/session-lifecycle';
import { PRODUCT } from '@/lib/config/product';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const client = createBrowserSupabaseClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!client || busy) return;

    setBusy(true);
    setMessage('');

    const result = await signInCurrentSession(
      {
        signIn: (credentials) => client.auth.signInWithPassword(credentials),
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
      },
      { email, password },
    );

    setBusy(false);
    if (!result.ok) setMessage(result.message);
  }

  return (
    <main className="oc-auth-wrap">
      <section className="oc-auth-card">
        <span className="oc-badge">OCPNG</span>
        <h1>{PRODUCT.name}</h1>
        <p className="oc-muted">
          Secure access to the Ombudsman Commission integrated oversight and case-management platform.
        </p>
        {!client ? (
          <div className="oc-notice">
            <strong>Authentication is not configured.</strong>
            <br />
            Add the approved Supabase public configuration in the deployment environment. No demonstration password bypass is provided.
          </div>
        ) : null}
        <form className="oc-form" onSubmit={submit}>
          <div>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <button className="oc-button" disabled={!client || busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {message ? <p className="oc-muted">{message}</p> : null}
        </form>
        <p className="oc-muted">
          <Link href="/forgot-password">Forgot password?</Link>
        </p>
      </section>
    </main>
  );
}

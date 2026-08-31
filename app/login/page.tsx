'use client';
import { useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';
import { PRODUCT } from '@/lib/config/product';
export default function LoginPage() {
  const client = createBrowserSupabaseClient();
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false);
  async function submit(e: React.FormEvent) { e.preventDefault(); if (!client) return; setBusy(true); setMessage(''); const { error } = await client.auth.signInWithPassword({ email, password }); setBusy(false); if (error) setMessage(error.message); else window.location.href='/dashboard'; }
  return <main className="oc-auth-wrap"><section className="oc-auth-card"><span className="oc-badge">OCPNG</span><h1>{PRODUCT.name}</h1><p className="oc-muted">Secure access to the Ombudsman Commission integrated oversight and case-management platform.</p>
    {!client ? <div className="oc-notice"><strong>Authentication is not configured.</strong><br/>Add the approved Supabase public configuration in the deployment environment. No demonstration password bypass is provided.</div> : null}
    <form className="oc-form" onSubmit={submit}><div><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div><div><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></div><button className="oc-button" disabled={!client||busy}>{busy?'Signing in…':'Sign in'}</button>{message ? <p className="oc-muted">{message}</p>:null}</form><p className="oc-muted"><Link href="/forgot-password">Forgot password?</Link></p></section></main>;
}

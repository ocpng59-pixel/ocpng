import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicEnvironment } from '@/lib/config/environment';

const publicSource = {
  NEXT_PUBLIC_APP_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://wasdok-demo.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_DEMO_public_key',
};
const jwt = (role: string) => [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ role, ref: 'DEMO-project' })).toString('base64url'),
  'DEMO-not-a-signature',
].join('.');

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe('WASDOK-62 public credential boundary', () => {
  it('only returns allowlisted public configuration even when server credentials exist', () => {
    expect(getPublicEnvironment({
      ...publicSource, SUPABASE_SERVICE_ROLE_KEY: 'DEMO-server-only-value',
      SUPABASE_SECRET_KEY: 'DEMO-server-only-secret',
    })).toEqual({
      appEnv: 'production', supabaseUrl: publicSource.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: publicSource.NEXT_PUBLIC_SUPABASE_ANON_KEY, strict: false,
    });
  });

  it.each([jwt('service_role'), 'sb_secret_DEMO_privileged_key'])
    ('rejects a privileged credential mistakenly placed in the public key setting (%#)', (credential) => {
      let message = '';
      try { getPublicEnvironment({ ...publicSource, NEXT_PUBLIC_SUPABASE_ANON_KEY: credential }); }
      catch (error) { message = (error as Error).message; }
      expect(message).toMatch(/public.*key|privileged|service.role/i);
      expect(message).not.toContain(credential);
    });

  it.each([jwt('anon'), 'sb_publishable_DEMO_public_key'])('allows an anonymous or publishable key (%#)', (key) => {
    expect(getPublicEnvironment({ ...publicSource, NEXT_PUBLIC_SUPABASE_ANON_KEY: key }).supabaseAnonKey).toBe(key);
  });

  it('the real browser client uses the public key when a server credential is also present', async () => {
    for (const [name, value] of Object.entries(publicSource)) vi.stubEnv(name, value);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'DEMO-server-only-value');
    let sentUrl = '';
    let sentHeaders = new Headers();
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      sentUrl = String(input);
      sentHeaders = new Headers(init?.headers);
      return Response.json([]);
    });
    const { createBrowserSupabaseClient } = await import('@/lib/supabase/browser');
    const client = createBrowserSupabaseClient();
    expect(client).not.toBeNull();
    await client!.from('audit_events').select('id');
    expect(sentUrl).toBe('https://wasdok-demo.supabase.co/rest/v1/audit_events?select=id');
    expect(sentHeaders.get('apikey')).toBe('sb_publishable_DEMO_public_key');
    expect(sentHeaders.get('authorization')).toBe('Bearer sb_publishable_DEMO_public_key');
    await client?.auth.stopAutoRefresh();
  });
});

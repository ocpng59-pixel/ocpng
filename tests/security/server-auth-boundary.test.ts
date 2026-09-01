import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '@/proxy';
import DashboardLayout from '@/app/dashboard/layout';

const { requestCookies } = vi.hoisted(() => ({ requestCookies: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: requestCookies }));

// Exercise real Supabase SSR, claims validation, cookie adapters and Next responses.
// Only the external Auth HTTP service and the framework request context are replaced.
const apiUrl = 'https://wasdok-demo.supabase.co';
const cookieName = 'sb-wasdok-demo-auth-token';
const user = {
  id: '00000000-0000-4000-8000-000000000062',
  aud: 'authenticated', role: 'authenticated', email: 'demo-wasdok62@example.invalid',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  created_at: '2026-09-01T00:00:00Z', identities: [],
};

function session(expiresAt: number, refreshToken = 'DEMO-refresh-token') {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expiresAt,
    iat: expiresAt - 3600, iss: `${apiUrl}/auth/v1`,
  })).toString('base64url');
  const signature = createHmac('sha256', 'DEMO-only-not-a-real-signing-key')
    .update(`${header}.${payload}`).digest('base64url');
  return {
    access_token: `${header}.${payload}.${signature}`, refresh_token: refreshToken,
    expires_at: expiresAt, expires_in: 3600, token_type: 'bearer', user,
  };
}

function request(path = '/dashboard', storedSession?: unknown) {
  const req = new NextRequest(`https://wasdok.example${path}`);
  if (storedSession) {
    req.cookies.set(cookieName, `base64-${Buffer.from(JSON.stringify(storedSession)).toString('base64url')}`);
  }
  requestCookies.mockResolvedValue(req.cookies);
  return req;
}

function authService(refreshResponse: unknown, refreshStatus = 200, rejectUser = false) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin !== apiUrl) throw new Error('Unexpected external request');
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ refresh_token: 'DEMO-refresh-token' });
      return Response.json(refreshResponse, { status: refreshStatus, headers: { 'x-supabase-api-version': '2024-01-01' } });
    }
    if (url.pathname === '/auth/v1/user') {
      return rejectUser
        ? Response.json({ msg: 'Invalid JWT', code: 'bad_jwt' }, { status: 401 })
        : Response.json(user);
    }
    throw new Error(`Unexpected Auth path: ${url.pathname}`);
  }));
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', apiUrl);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'DEMO-public-anon-key');
  vi.stubEnv('OCPNG_STRICT_ENV', 'true');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('WASDOK-62 server authentication boundary', () => {
  it.each(['/dashboard', '/dashboard/complaints', '/dashboard/annual-statements', '/dashboard/legal/DEMO-62'])
    ('redirects unauthenticated %s before protected content is returned', async (path) => {
      const response = await proxy(request(`${path}?private=DEMO-sensitive`));
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('https://wasdok.example/login');
      expect(await response.text()).toBe('');
    });

  it('the layout independently denies a request that bypasses the proxy', async () => {
    request();
    await expect(DashboardLayout({ children: 'DEMO protected content' })).rejects.toThrow('NEXT_REDIRECT');
  });

  it('the layout denies missing local configuration without rendering protected children', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'development');
    vi.stubEnv('OCPNG_STRICT_ENV', 'false');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    await expect(DashboardLayout({ children: 'DEMO protected content' })).rejects.toThrow('NEXT_REDIRECT');
  });

  it('rejects a forged cookie even when its embedded user and expiry look valid', async () => {
    authService(null, 400, true);
    const response = await proxy(request('/dashboard', session(Math.floor(Date.now() / 1000) + 3600)));
    expect(response.status).toBe(307);
    await expect(DashboardLayout({ children: 'DEMO protected content' })).rejects.toThrow('NEXT_REDIRECT');
  });

  it('allows a session verified by the Auth service', async () => {
    authService(null);
    const response = await proxy(request('/dashboard', session(Math.floor(Date.now() / 1000) + 3600)));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
  });

  it('refreshes an expired access token and propagates rotated cookies and no-store headers', async () => {
    const refreshed = session(Math.floor(Date.now() / 1000) + 3600, 'DEMO-rotated-refresh-token');
    authService(refreshed);
    const req = request('/dashboard', session(Math.floor(Date.now() / 1000) - 60));
    const response = await proxy(req);
    expect(response.status).toBe(200);
    const rotated = response.cookies.get(cookieName)?.value;
    expect(rotated).toBeTruthy();
    expect(req.cookies.get(cookieName)?.value).toBe(rotated);
    expect(JSON.parse(Buffer.from(rotated!.slice(7), 'base64url').toString()).refresh_token)
      .toBe('DEMO-rotated-refresh-token');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it.each([
    ['expired refresh token', 'refresh_token_not_found'],
    ['revoked refresh token', 'refresh_token_already_used'],
  ])('rejects an expired access token with %s and clears the browser cookie', async (_name, code) => {
    authService({ msg: 'Invalid Refresh Token', code }, 400);
    const response = await proxy(request('/dashboard', session(Math.floor(Date.now() / 1000) - 60)));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://wasdok.example/login');
    expect(response.cookies.get(cookieName)?.value).toBe('');
    expect(response.cookies.get(cookieName)?.maxAge).toBe(0);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('denies malformed tokens without returning protected content', async () => {
    const broken = { ...session(Math.floor(Date.now() / 1000) + 3600), access_token: 'DEMO-invalid-token' };
    const response = await proxy(request('/dashboard', broken));
    expect(response.status).toBe(307);
    expect(await response.text()).toBe('');
  });
});

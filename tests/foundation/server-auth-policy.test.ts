import { describe, expect, it } from 'vitest';
import { isProtectedApplicationPath, shouldRedirectUnauthenticated } from '@/lib/auth/server-route-policy';

describe('server authentication route policy', () => {
  it('protects the application dashboard and all nested operational routes', () => {
    expect(isProtectedApplicationPath('/dashboard')).toBe(true);
    expect(isProtectedApplicationPath('/dashboard/complaints')).toBe(true);
    expect(isProtectedApplicationPath('/dashboard/investigations/INV-DEMO-001')).toBe(true);
  });

  it('keeps sign-in and account-recovery entry points public', () => {
    expect(isProtectedApplicationPath('/login')).toBe(false);
    expect(isProtectedApplicationPath('/forgot-password')).toBe(false);
    expect(isProtectedApplicationPath('/set-password')).toBe(false);
    expect(isProtectedApplicationPath('/')).toBe(false);
  });

  it('redirects an unauthenticated request only when the path is protected', () => {
    expect(shouldRedirectUnauthenticated('/dashboard', false)).toBe(true);
    expect(shouldRedirectUnauthenticated('/dashboard/cases', true)).toBe(false);
    expect(shouldRedirectUnauthenticated('/login', false)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  hasValidServerSession,
  shouldReturnToLoginAfterAuthEvent,
  signOutCurrentSession,
} from '@/lib/auth/session-lifecycle';

describe('session lifecycle', () => {
  it('requests local-only Supabase sign out for the current browser session', async () => {
    let requestedScope: string | undefined;

    await signOutCurrentSession({
      signOut: async ({ scope }) => {
        requestedScope = scope;
        return { error: null };
      },
      redirect: () => undefined,
    });

    expect(requestedScope).toBe('local');
  });

  it('redirects to login only after a successful sign out', async () => {
    const events: string[] = [];

    const result = await signOutCurrentSession({
      signOut: async () => {
        events.push('signed-out');
        return { error: null };
      },
      redirect: (path) => events.push(`redirect:${path}`),
    });

    expect(result).toEqual({ ok: true });
    expect(events).toEqual(['signed-out', 'redirect:/login']);
  });

  it('keeps the user on the current page when Supabase sign out fails', async () => {
    let redirected = false;

    const result = await signOutCurrentSession({
      signOut: async () => ({ error: { message: 'Network unavailable' } }),
      redirect: () => {
        redirected = true;
      },
    });

    expect(result).toEqual({ ok: false, message: 'Network unavailable' });
    expect(redirected).toBe(false);
  });

  it('accepts a server session only when verified claims are present without error', async () => {
    const valid = await hasValidServerSession(async () => ({
      data: { claims: { sub: 'user-1' } },
      error: null,
    }));

    expect(valid).toBe(true);
  });

  it('fails closed when an expired, invalid or revoked session cannot produce verified claims', async () => {
    const invalid = await hasValidServerSession(async () => ({
      data: { claims: null },
      error: { message: 'JWT expired' },
    }));

    expect(invalid).toBe(false);
  });

  it('fails closed when session refresh or verification throws unexpectedly', async () => {
    const valid = await hasValidServerSession(async () => {
      throw new Error('refresh failed');
    });

    expect(valid).toBe(false);
  });

  it('returns a protected browser route to login when auth state loses its session', () => {
    expect(
      shouldReturnToLoginAfterAuthEvent({
        event: 'SIGNED_OUT',
        hasSession: false,
        pathname: '/dashboard/annual-statements',
      }),
    ).toBe(true);

    expect(
      shouldReturnToLoginAfterAuthEvent({
        event: 'TOKEN_REFRESHED',
        hasSession: false,
        pathname: '/dashboard',
      }),
    ).toBe(true);
  });

  it('does not redirect a valid refreshed session or public route', () => {
    expect(
      shouldReturnToLoginAfterAuthEvent({
        event: 'TOKEN_REFRESHED',
        hasSession: true,
        pathname: '/dashboard',
      }),
    ).toBe(false);

    expect(
      shouldReturnToLoginAfterAuthEvent({
        event: 'SIGNED_OUT',
        hasSession: false,
        pathname: '/login',
      }),
    ).toBe(false);
  });
});

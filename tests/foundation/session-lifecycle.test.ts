import { describe, expect, it } from 'vitest';
import {
  hasValidServerSession,
  shouldReturnToLoginAfterAuthEvent,
  signInCurrentSession,
  signOutCurrentSession,
} from '@/lib/auth/session-lifecycle';

describe('session lifecycle', () => {
  it('audits a successful password sign-in before entering the dashboard', async () => {
    const events: string[] = [];
    let auditContext: unknown;

    const result = await signInCurrentSession(
      {
        signIn: async ({ email, password }) => {
          expect(email).toBe('officer@ombudsman.gov.pg');
          expect(password).toBe('temporary-login-secret');
          events.push('signed-in');
          return {
            data: { user: { id: '00000000-0000-0000-0000-000000000061' } },
            error: null,
          };
        },
        recordAudit: async (event) => {
          auditContext = event;
          events.push(`audit:${event.action}`);
          return { ok: true };
        },
        signOut: async () => {
          events.push('cleanup-sign-out');
          return { error: null };
        },
        redirect: (path) => events.push(`redirect:${path}`),
      },
      {
        email: 'officer@ombudsman.gov.pg',
        password: 'temporary-login-secret',
      },
    );

    expect(result).toEqual({ ok: true });
    expect(events).toEqual([
      'signed-in',
      'audit:auth.sign_in_succeeded',
      'redirect:/dashboard',
    ]);
    expect(auditContext).toEqual({
      actorId: '00000000-0000-0000-0000-000000000061',
      action: 'auth.sign_in_succeeded',
      requestMetadata: {
        path: '/login',
        auth_method: 'password',
        event_source: 'wasdok-web',
      },
    });
    expect(JSON.stringify(auditContext)).not.toContain('temporary-login-secret');
  });

  it('fails closed when authenticated sign-in cannot be recorded in the WASDOK audit trail', async () => {
    const events: string[] = [];

    const result = await signInCurrentSession(
      {
        signIn: async () => ({
          data: { user: { id: '00000000-0000-0000-0000-000000000061' } },
          error: null,
        }),
        recordAudit: async () => ({ ok: false, message: 'audit unavailable' }),
        signOut: async ({ scope }) => {
          events.push(`cleanup:${scope}`);
          return { error: null };
        },
        redirect: (path) => events.push(`redirect:${path}`),
      },
      {
        email: 'officer@ombudsman.gov.pg',
        password: 'temporary-login-secret',
      },
    );

    expect(result).toEqual({
      ok: false,
      message: 'Unable to establish an audited session',
    });
    expect(events).toEqual(['cleanup:local']);
  });

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

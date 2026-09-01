import { describe, expect, it } from 'vitest';
import { signOutCurrentSession } from '@/lib/auth/session-lifecycle';

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
});

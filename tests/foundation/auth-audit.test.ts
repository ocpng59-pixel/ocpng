import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  recordAuthenticatedAuthEvent,
  sanitizeAuthAuditMetadata,
} from '@/lib/auth/audit';

describe('authentication audit events', () => {
  it('keeps only approved non-secret request metadata', () => {
    expect(
      sanitizeAuthAuditMetadata({
        path: '/login',
        auth_method: 'password',
        event_source: 'wasdok-web',
        reason_code: 'user_initiated',
        password: 'never-store-me',
        access_token: 'access-secret',
        refresh_token: 'refresh-secret',
        authorization: 'Bearer secret',
        cookie: 'session=secret',
        secret: 'secret-value',
        nested: { token: 'nested-secret' },
      }),
    ).toEqual({
      path: '/login',
      auth_method: 'password',
      event_source: 'wasdok-web',
      reason_code: 'user_initiated',
    });
  });

  it('writes a controlled append-only auth event for the authenticated actor', async () => {
    let inserted: unknown;

    const result = await recordAuthenticatedAuthEvent({
      insert: async (row) => {
        inserted = row;
        return { error: null };
      },
      actorId: '00000000-0000-0000-0000-000000000061',
      action: 'auth.sign_in_succeeded',
      requestMetadata: {
        path: '/login',
        auth_method: 'password',
        password: 'must-not-reach-audit',
      },
    });

    expect(result).toEqual({ ok: true });
    expect(inserted).toEqual({
      actor_id: '00000000-0000-0000-0000-000000000061',
      action: 'auth.sign_in_succeeded',
      entity_type: 'auth_session',
      request_metadata: {
        path: '/login',
        auth_method: 'password',
      },
      classification: 'RESTRICTED',
      metadata: { source: 'wasdok-auth' },
    });
  });

  it('returns a safe failure result when the audit insert fails', async () => {
    const result = await recordAuthenticatedAuthEvent({
      insert: async () => ({ error: { message: 'database unavailable' } }),
      actorId: '00000000-0000-0000-0000-000000000061',
      action: 'auth.sign_out',
      requestMetadata: { path: '/dashboard' },
    });

    expect(result).toEqual({ ok: false, message: 'database unavailable' });
  });

  it('requires authenticated audit inserts to use the current auth uid as actor', () => {
    const migration = readFileSync(
      'supabase/migrations/20260902000700_auth_audit_actor_integrity.sql',
      'utf8',
    );

    expect(migration).toContain('drop policy if exists audit_events_insert on public.audit_events');
    expect(migration).toContain('actor_id = auth.uid()');
    expect(migration).toContain('auth.uid() is not null');
  });

  it('wires the login page through the audited sign-in lifecycle', () => {
    const loginPage = readFileSync('app/login/page.tsx', 'utf8');

    expect(loginPage).toContain('signInCurrentSession');
    expect(loginPage).toContain('recordAuthenticatedAuthEvent');
    expect(loginPage).toMatch(/from\(['"]audit_events['"]\)\.insert\(row\)/);
    expect(loginPage).not.toContain("else window.location.href='/dashboard'");
  });

  it('wires the sign-out control with the authenticated actor before local logout', () => {
    const signOutControl = readFileSync('components/sign-out-control.tsx', 'utf8');

    expect(signOutControl).toContain('useAuth');
    expect(signOutControl).toContain('recordAuthenticatedAuthEvent');
    expect(signOutControl).toContain('actorId: session?.user.id');
    expect(signOutControl).toContain('pathname: window.location.pathname');
    expect(signOutControl).toMatch(/from\(['"]audit_events['"]\)\.insert\(row\)/);
  });
});

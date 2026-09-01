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
});

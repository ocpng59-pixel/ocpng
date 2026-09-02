import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  grantUserCompartment,
  mapAccessControlError,
} from '@/lib/access-control/mutations';

const { createServerClient } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerClient,
}));

beforeEach(() => {
  createServerClient.mockReset();
});

describe('WASDOK-78 access control mutation adapters', () => {
  it('sends only trusted RPC input fields for a compartment grant', async () => {
    const rpc = vi.fn(async () => ({ data: '78000000-0000-0000-0000-000000000900', error: null }));
    createServerClient.mockResolvedValue({ rpc });

    await expect(grantUserCompartment({
      userId: '78000000-0000-0000-0000-000000000002',
      compartment: 'CONFIDENTIAL',
      reason: 'Grant controlled complaint review access',
    })).resolves.toEqual({ ok: true, message: 'Compartment granted.' });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('admin_grant_user_compartment', {
      p_user_id: '78000000-0000-0000-0000-000000000002',
      p_compartment_code: 'CONFIDENTIAL',
      p_reason: 'Grant controlled complaint review access',
    });

    const sent = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('actorId');
    expect(sent).not.toHaveProperty('actor_id');
    expect(sent).not.toHaveProperty('grantedBy');
    expect(sent).not.toHaveProperty('granted_by');
    expect(sent).not.toHaveProperty('auditTimestamp');
    expect(sent).not.toHaveProperty('audit_timestamp');
  });

  it('fails closed when the server Supabase client is unavailable', async () => {
    createServerClient.mockResolvedValue(null);

    await expect(grantUserCompartment({
      userId: '78000000-0000-0000-0000-000000000002',
      compartment: 'RESTRICTED',
      reason: 'Grant controlled restricted access',
    })).resolves.toEqual({ ok: false, message: 'Access Control is unavailable.' });
  });

  it('maps database security errors to safe application messages', () => {
    expect(mapAccessControlError('42501')).toBe('Administrative permission denied.');
    expect(mapAccessControlError('22023')).toBe('The submitted access change is invalid.');
    expect(mapAccessControlError('23505')).toBe('That active assignment already exists.');
    expect(mapAccessControlError('23514')).toBe('The access change is blocked by a security safeguard.');
    expect(mapAccessControlError('P0002')).toBe('The access change could not be completed.');
  });
});

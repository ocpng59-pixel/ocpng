import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inviteApplicationUser } from '@/lib/access-control/invitations';

const { createServerClient, createServiceClient } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerClient,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: createServiceClient,
}));

beforeEach(() => {
  createServerClient.mockReset();
  createServiceClient.mockReset();
});

describe('WASDOK-78 protected user invitation adapter', () => {
  it('fails closed when the authenticated server client is unavailable', async () => {
    createServerClient.mockResolvedValue(null);

    await expect(inviteApplicationUser({
      email: 'new.user@example.invalid',
      displayName: 'DEMO WASDOK78 New User',
      reason: 'Invite controlled UAT user',
    })).resolves.toEqual({ ok: false, message: 'Access Control is unavailable.' });

    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('denies invitation before creating the service client when admin.manage_users is not granted', async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    createServerClient.mockResolvedValue({ rpc });

    await expect(inviteApplicationUser({
      email: 'new.user@example.invalid',
      displayName: 'DEMO WASDOK78 New User',
      reason: 'Invite controlled UAT user',
    })).resolves.toEqual({ ok: false, message: 'Administrative permission denied.' });

    expect(rpc).toHaveBeenCalledWith('has_permission', { permission_code: 'admin.manage_users' });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('fails closed on permission-check errors without creating the service client', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: 'PGRST000', message: 'DEMO permission failure' } }));
    createServerClient.mockResolvedValue({ rpc });

    await expect(inviteApplicationUser({
      email: 'new.user@example.invalid',
      displayName: 'DEMO WASDOK78 New User',
      reason: 'Invite controlled UAT user',
    })).resolves.toEqual({ ok: false, message: 'Administrative permission denied.' });

    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('invites an authorized user with only safe Auth metadata', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    createServerClient.mockResolvedValue({ rpc });

    const inviteUserByEmail = vi.fn(async () => ({ data: { user: { id: '78000000-0000-0000-0000-000000000020' } }, error: null }));
    createServiceClient.mockReturnValue({ auth: { admin: { inviteUserByEmail } } });

    await expect(inviteApplicationUser({
      email: ' new.user@example.invalid ',
      displayName: ' DEMO WASDOK78 New User ',
      reason: ' Invite controlled UAT user ',
    })).resolves.toEqual({ ok: true, message: 'User invitation sent.' });

    expect(inviteUserByEmail).toHaveBeenCalledTimes(1);
    expect(inviteUserByEmail).toHaveBeenCalledWith('new.user@example.invalid', {
      data: { display_name: 'DEMO WASDOK78 New User' },
    });
  });

  it('never returns raw privileged configuration or Auth error material', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    createServerClient.mockResolvedValue({ rpc });

    const exposedSecret = 'sb_secret_DEMO_MUST_NEVER_ESCAPE';
    const inviteUserByEmail = vi.fn(async () => ({
      data: null,
      error: { message: `Auth failed with ${exposedSecret}`, code: 'unexpected_failure' },
    }));
    createServiceClient.mockReturnValue({ auth: { admin: { inviteUserByEmail } } });

    const result = await inviteApplicationUser({
      email: 'new.user@example.invalid',
      displayName: 'DEMO WASDOK78 New User',
      reason: 'Invite controlled UAT user',
    });

    expect(result).toEqual({ ok: false, message: 'The user invitation could not be sent.' });
    expect(JSON.stringify(result)).not.toContain(exposedSecret);
    expect(JSON.stringify(result)).not.toContain('unexpected_failure');
  });

  it('rejects an invalid administrative reason before creating the service client', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    createServerClient.mockResolvedValue({ rpc });

    await expect(inviteApplicationUser({
      email: 'new.user@example.invalid',
      displayName: 'DEMO WASDOK78 New User',
      reason: 'x',
    })).resolves.toEqual({ ok: false, message: 'Administrative reason is required.' });

    expect(createServiceClient).not.toHaveBeenCalled();
  });
});

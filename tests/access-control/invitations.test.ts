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

  it('invites an authorized user and records immutable invitation audit evidence', async () => {
    const invitedUserId = '78000000-0000-0000-0000-000000000020';
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    createServerClient.mockResolvedValue({ rpc });

    const inviteUserByEmail = vi.fn(async () => ({ data: { user: { id: invitedUserId } }, error: null }));
    const deleteUser = vi.fn(async () => ({ data: null, error: null }));
    createServiceClient.mockReturnValue({ auth: { admin: { inviteUserByEmail, deleteUser } } });

    await expect(inviteApplicationUser({
      email: ' new.user@example.invalid ',
      displayName: ' DEMO WASDOK78 New User ',
      reason: ' Invite controlled UAT user ',
    })).resolves.toEqual({ ok: true, message: 'User invitation sent.' });

    expect(inviteUserByEmail).toHaveBeenCalledTimes(1);
    expect(inviteUserByEmail).toHaveBeenCalledWith('new.user@example.invalid', {
      data: { display_name: 'DEMO WASDOK78 New User' },
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'admin_record_user_invitation', {
      p_user_id: invitedUserId,
      p_reason: 'Invite controlled UAT user',
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('compensates the Auth identity when immutable invitation audit recording fails', async () => {
    const invitedUserId = '78000000-0000-0000-0000-000000000021';
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'DEMO audit denial' } });
    createServerClient.mockResolvedValue({ rpc });

    const inviteUserByEmail = vi.fn(async () => ({ data: { user: { id: invitedUserId } }, error: null }));
    const deleteUser = vi.fn(async () => ({ data: null, error: null }));
    createServiceClient.mockReturnValue({ auth: { admin: { inviteUserByEmail, deleteUser } } });

    await expect(inviteApplicationUser({
      email: 'new.user@example.invalid',
      displayName: 'DEMO WASDOK78 New User',
      reason: 'Invite controlled UAT user',
    })).resolves.toEqual({ ok: false, message: 'The user invitation could not be completed securely.' });

    expect(deleteUser).toHaveBeenCalledWith(invitedUserId);
  });

  it('never returns raw privileged configuration or Auth error material', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    createServerClient.mockResolvedValue({ rpc });

    const exposedSecret = 'sb_secret_DEMO_MUST_NEVER_ESCAPE';
    const inviteUserByEmail = vi.fn(async () => ({
      data: null,
      error: { message: `Auth failed with ${exposedSecret}`, code: 'unexpected_failure' },
    }));
    const deleteUser = vi.fn(async () => ({ data: null, error: null }));
    createServiceClient.mockReturnValue({ auth: { admin: { inviteUserByEmail, deleteUser } } });

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

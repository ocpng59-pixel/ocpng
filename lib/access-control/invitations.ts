import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { AccessControlActionState } from '@/lib/access-control/types';

export async function inviteApplicationUser(input: {
  email: string;
  displayName: string;
  reason: string;
}): Promise<AccessControlActionState> {
  const session = await createServerSupabaseClient();
  if (!session) return { ok: false, message: 'Access Control is unavailable.' };

  const { data: allowed, error: permissionError } = await session.rpc('has_permission', {
    permission_code: 'admin.manage_users',
  });

  if (permissionError || allowed !== true) {
    return { ok: false, message: 'Administrative permission denied.' };
  }

  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    return { ok: false, message: 'Administrative reason is required.' };
  }

  const service = createServiceSupabaseClient();
  let invitedUserId: string | null = null;

  try {
    const { data, error } = await service.auth.admin.inviteUserByEmail(input.email.trim(), {
      data: { display_name: input.displayName.trim() },
    });

    if (error || !data.user?.id) {
      return { ok: false, message: 'The user invitation could not be sent.' };
    }

    invitedUserId = data.user.id;
    const { error: auditError } = await session.rpc('admin_record_user_invitation', {
      p_user_id: invitedUserId,
      p_reason: reason,
    });

    if (auditError) {
      try {
        await service.auth.admin.deleteUser(invitedUserId);
      } catch {
        // Fail closed to the caller. Operations must investigate if Auth cleanup
        // is unavailable because an invitation may have been emitted externally.
      }
      return { ok: false, message: 'The user invitation could not be completed securely.' };
    }

    return { ok: true, message: 'User invitation sent.' };
  } catch {
    if (invitedUserId) {
      try {
        await service.auth.admin.deleteUser(invitedUserId);
      } catch {
        // Never expose privileged Auth/service error material to the browser.
      }
    }
    return { ok: false, message: 'The user invitation could not be sent.' };
  }
}

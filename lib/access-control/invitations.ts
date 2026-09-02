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

  try {
    const service = createServiceSupabaseClient();
    const { error } = await service.auth.admin.inviteUserByEmail(input.email.trim(), {
      data: { display_name: input.displayName.trim() },
    });

    if (error) {
      return { ok: false, message: 'The user invitation could not be sent.' };
    }

    return { ok: true, message: 'User invitation sent.' };
  } catch {
    return { ok: false, message: 'The user invitation could not be sent.' };
  }
}

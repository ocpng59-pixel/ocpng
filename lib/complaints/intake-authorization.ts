import { hasValidServerSession } from '@/lib/auth/session-lifecycle';
import { isPermissionAndClassificationAuthorized } from '@/lib/rbac/module-route-authorization';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// This gate covers a blank form and validation only. Record access/persistence
// must also enforce organisational scope and assignment in the database.
export async function canUseAssistedIntake(): Promise<boolean> {
  try {
    const client = await createServerSupabaseClient();
    if (!client || !(await hasValidServerSession(() => client.auth.getClaims()))) return false;
    return await isPermissionAndClassificationAuthorized('complaints.create', 'CONFIDENTIAL', {
      hasPermission: async (permission) => {
        const { data, error } = await client.rpc('has_permission', { permission_code: permission });
        return !error && data === true;
      },
      hasCompartment: async (classification) => {
        const { data, error } = await client.rpc('has_compartment', { classification_code: classification });
        return !error && data === true;
      },
    });
  } catch {
    return false;
  }
}

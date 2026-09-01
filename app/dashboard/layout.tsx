import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { hasValidServerSession } from '@/lib/auth/session-lifecycle';
import { resolveAuthorizedNavigation } from '@/lib/rbac/authorized-navigation';
import { NAVIGATION } from '@/lib/rbac/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) redirect('/login');

  const isAuthenticated = await hasValidServerSession(() => supabase.auth.getClaims());
  if (!isAuthenticated) redirect('/login');

  const navigation = await resolveAuthorizedNavigation(NAVIGATION, {
    hasPermission: async (permission) => {
      const { data, error } = await supabase.rpc('has_permission', {
        permission_code: permission,
      });
      return !error && data === true;
    },
    hasCompartment: async (classification) => {
      const { data, error } = await supabase.rpc('has_compartment', {
        classification_code: classification,
      });
      return !error && data === true;
    },
  });

  return <AppShell navigation={navigation}>{children}</AppShell>;
}

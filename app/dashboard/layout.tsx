import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { hasValidServerSession } from '@/lib/auth/session-lifecycle';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) redirect('/login');

  const isAuthenticated = await hasValidServerSession(() => supabase.auth.getClaims());
  if (!isAuthenticated) redirect('/login');

  return <AppShell>{children}</AppShell>;
}

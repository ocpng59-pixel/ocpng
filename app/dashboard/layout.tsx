import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) redirect('/login');
  }

  return <AppShell>{children}</AppShell>;
}

import { notFound } from 'next/navigation';
import { ModuleLanding } from '@/components/module-landing';
import { MODULE_PAGES } from '@/lib/config/module-pages';
import {
  isModuleRouteAuthorized,
  resolveAuthorizedModuleActions,
} from '@/lib/rbac/module-route-authorization';
import type { PermissionCode, SecurityClassification } from '@/lib/rbac/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function ModuleRoute({ params }: { params: Promise<{ module: string[] }> }) {
  const { module } = await params;
  const pathname = `/dashboard/${module.join('/')}`;
  const page = MODULE_PAGES[pathname];
  if (!page) notFound();

  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();

  const checks = {
    hasPermission: async (permission: PermissionCode) => {
      const { data, error } = await supabase.rpc('has_permission', {
        permission_code: permission,
      });
      return !error && data === true;
    },
    hasCompartment: async (classification: SecurityClassification) => {
      const { data, error } = await supabase.rpc('has_compartment', {
        classification_code: classification,
      });
      return !error && data === true;
    },
  };

  const authorized = await isModuleRouteAuthorized(page, checks);
  if (!authorized) notFound();

  const authorizedActions = await resolveAuthorizedModuleActions(
    page.actions,
    page.classification,
    checks,
  );

  return <ModuleLanding page={{ ...page, actions: authorizedActions }} />;
}

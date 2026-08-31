import { notFound } from 'next/navigation';
import { ModuleLanding } from '@/components/module-landing';
import { MODULE_PAGES } from '@/lib/config/module-pages';

export default async function ModuleRoute({ params }: { params: Promise<{ module: string[] }> }) {
  const { module } = await params;
  const pathname = `/dashboard/${module.join('/')}`;
  const page = MODULE_PAGES[pathname];
  if (!page) notFound();
  return <ModuleLanding page={page} />;
}

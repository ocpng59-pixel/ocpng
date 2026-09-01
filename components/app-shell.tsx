import { Sidebar } from './sidebar';
import { SignOutControl } from './sign-out-control';
import { PRODUCT } from '@/lib/config/product';
import type { NavigationSection } from '@/lib/rbac/types';

export function AppShell({
  children,
  navigation,
}: {
  children: React.ReactNode;
  navigation: NavigationSection[];
}) {
  return (
    <div className="oc-shell">
      <Sidebar navigation={navigation} />
      <main className="oc-main">
        <header className="oc-topbar">
          <strong>{PRODUCT.formalName}</strong>
          <div className="oc-topbar-actions">
            <small>{PRODUCT.release}</small>
            <SignOutControl />
          </div>
        </header>
        <section className="oc-content">{children}</section>
      </main>
    </div>
  );
}

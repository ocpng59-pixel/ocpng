import { Sidebar } from './sidebar';
import { SignOutControl } from './sign-out-control';
import { PRODUCT } from '@/lib/config/product';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="oc-shell">
      <Sidebar />
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

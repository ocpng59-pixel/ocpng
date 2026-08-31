import { Sidebar } from './sidebar';
import { PRODUCT } from '@/lib/config/product';
export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="oc-shell"><Sidebar/><main className="oc-main"><header className="oc-topbar"><strong>{PRODUCT.formalName}</strong><small>{PRODUCT.release}</small></header><section className="oc-content">{children}</section></main></div>;
}

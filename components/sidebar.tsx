'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PRODUCT } from '@/lib/config/product';
import type { NavigationSection } from '@/lib/rbac/types';

export function Sidebar({ navigation }: { navigation: readonly NavigationSection[] }) {
  const pathname = usePathname();

  return (
    <aside className="oc-sidebar">
      <div className="oc-brand">
        <strong>{PRODUCT.name}</strong>
        <span>Ombudsman Commission of Papua New Guinea</span>
      </div>
      {navigation.map((section) => (
        <nav className="oc-nav-section" key={section.title}>
          <h3>{section.title}</h3>
          {section.items.map((item) => (
            <Link
              className={`oc-nav-link${pathname === item.href ? ' active' : ''}`}
              href={item.href}
              key={item.href}
            >
              {item.title}
            </Link>
          ))}
        </nav>
      ))}
    </aside>
  );
}

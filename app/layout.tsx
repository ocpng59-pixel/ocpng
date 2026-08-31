import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { PRODUCT } from '@/lib/config/product';

export const metadata: Metadata = { title: `${PRODUCT.name} | OCPNG`, description: PRODUCT.formalName };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AuthProvider>{children}</AuthProvider></body></html>;
}

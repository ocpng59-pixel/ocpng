import type { Metadata } from 'next';
import Link from 'next/link';
import { ComplaintIntakeForm } from '@/components/complaints/intake-form';
import { checkPublicIntake } from './actions';

export const metadata: Metadata = {
  title: 'Complaint form preview | WASDOK 360',
  robots: { index: false, follow: false },
};

export default function PublicIntakePage() {
  return (
    <main className="oc-intake-public">
      <p className="oc-intake-brand">WASDOK 360 · Ombudsman Commission of Papua New Guinea</p>
      <ComplaintIntakeForm mode="public" checkAction={checkPublicIntake} />
      <p className="oc-intake-footer"><Link href="/login">Staff sign in</Link></p>
    </main>
  );
}

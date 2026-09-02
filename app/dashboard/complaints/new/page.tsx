import { notFound } from 'next/navigation';
import { ComplaintIntakeForm } from '@/components/complaints/intake-form';
import { checkAssistedIntake, submitAssistedIntake } from '@/app/complaints/intake/actions';
import { canUseAssistedIntake } from '@/lib/complaints/intake-authorization';

export const dynamic = 'force-dynamic';

export default async function AssistedIntakePage() {
  if (!(await canUseAssistedIntake())) notFound();
  return (
    <ComplaintIntakeForm
      mode="assisted"
      checkAction={checkAssistedIntake}
      submitAction={submitAssistedIntake}
    />
  );
}

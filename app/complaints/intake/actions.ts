'use server';

import { checkComplaintIntakeForm, type IntakeCheckResult } from '@/lib/complaints/intake-schema';
import { canUseAssistedIntake } from '@/lib/complaints/intake-authorization';

export async function checkPublicIntake(form: FormData): Promise<IntakeCheckResult> {
  return checkComplaintIntakeForm(form);
}

export async function checkAssistedIntake(form: FormData): Promise<IntakeCheckResult> {
  if (!(await canUseAssistedIntake())) {
    return {
      status: 'unauthorized', fieldErrors: {},
      formError: 'Your session or access has changed. Sign in again or contact your administrator before continuing.',
    };
  }
  return checkComplaintIntakeForm(form);
}

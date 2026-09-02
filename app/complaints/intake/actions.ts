'use server';

import { canUseAssistedIntake } from '@/lib/complaints/intake-authorization';
import {
  checkComplaintIntakeForm,
  type IntakeCheckResult,
} from '@/lib/complaints/intake-schema';
import {
  submitComplaintIntake,
  type IntakeSubmissionResult,
} from '@/lib/complaints/intake-submission';
import {
  persistComplaintSubmission,
  resolveAssistedSubmissionContext,
} from '@/lib/complaints/intake-submission-server';
import { isComplaintSubmissionEnabled } from '@/lib/config/server-environment';

const submissionDisabled = (): IntakeSubmissionResult => ({
  status: 'unavailable',
  fieldErrors: {},
  formError: 'Complaint submission is not enabled yet.',
});

const assistedUnauthorized = (): IntakeSubmissionResult => ({
  status: 'unauthorized',
  fieldErrors: {},
  formError: 'Your session or access has changed. Sign in again or contact your administrator before continuing.',
});

export async function checkPublicIntake(form: FormData): Promise<IntakeCheckResult> {
  return checkComplaintIntakeForm(form);
}

export async function checkAssistedIntake(form: FormData): Promise<IntakeCheckResult> {
  if (!(await canUseAssistedIntake())) {
    return assistedUnauthorized();
  }
  return checkComplaintIntakeForm(form);
}

export async function submitPublicIntake(
  form: FormData,
  idempotencyKey: string,
): Promise<IntakeSubmissionResult> {
  if (!isComplaintSubmissionEnabled()) return submissionDisabled();

  return submitComplaintIntake({
    form,
    idempotencyKey,
    channel: 'public_web',
    scope: 'OCPNG',
    actorId: null,
  }, { persist: persistComplaintSubmission });
}

export async function submitAssistedIntake(
  form: FormData,
  idempotencyKey: string,
): Promise<IntakeSubmissionResult> {
  if (!isComplaintSubmissionEnabled()) return submissionDisabled();

  const context = await resolveAssistedSubmissionContext();
  if (!context) return assistedUnauthorized();

  return submitComplaintIntake({
    form,
    idempotencyKey,
    channel: 'assisted_internal',
    scope: context.scope,
    actorId: context.actorId,
  }, { persist: persistComplaintSubmission });
}

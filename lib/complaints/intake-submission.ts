import { createHash } from 'node:crypto';
import {
  INTAKE_FIELDS,
  parseComplaintIntake,
  type ComplaintIntake,
  type IntakeFieldErrors,
} from '@/lib/complaints/intake-schema';
import {
  parseComplaintIntakePrivacy,
  type ComplaintIntakePrivacyEvidence,
} from '@/lib/complaints/intake-privacy';

export type ComplaintSubmissionChannel = 'public_web' | 'assisted_internal';

export type PersistComplaintSubmission = {
  channel: ComplaintSubmissionChannel;
  scope: string;
  actorId: string | null;
  idempotencyKeyHash: string;
  complaint: ComplaintIntake;
  privacy: ComplaintIntakePrivacyEvidence;
};

export type PersistComplaintSubmissionResult = {
  receiptReference: string;
  duplicate: boolean;
};

export type IntakeSubmissionResult =
  | {
      status: 'submitted';
      fieldErrors: Record<string, never>;
      receiptReference: string;
      duplicate: boolean;
    }
  | {
      status: 'invalid' | 'unavailable' | 'unauthorized';
      fieldErrors: IntakeFieldErrors;
      formError: string;
    };

type SubmissionDependencies = {
  persist: (submission: PersistComplaintSubmission) => Promise<PersistComplaintSubmissionResult>;
};

type SubmissionInput = {
  form: FormData;
  idempotencyKey: string;
  channel: ComplaintSubmissionChannel;
  scope: string;
  actorId: string | null;
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECEIPT_REFERENCE = /^OC-RCP-[0-9]{4}-[A-F0-9]{16}$/;
const PRIVACY_FORM_FIELDS = new Set([
  'privacyAcknowledged',
  'privacyNotRequiredReason',
  // These names are explicitly treated as untrusted browser metadata. They may
  // be present in a request, but the server never derives evidence from them.
  'privacyNoticeVersion',
  'privacyAcknowledgedAt',
  'privacyActorId',
]);
const INTAKE_FIELD_NAMES = Object.keys(INTAKE_FIELDS) as (keyof typeof INTAKE_FIELDS)[];
const ALLOWED_FORM_FIELDS = new Set<string>([
  ...INTAKE_FIELD_NAMES,
  ...PRIVACY_FORM_FIELDS,
]);

const unavailable = (): IntakeSubmissionResult => ({
  status: 'unavailable',
  fieldErrors: {},
  formError: 'Unable to submit the complaint right now. Please try again.',
});

const unauthorized = (): IntakeSubmissionResult => ({
  status: 'unauthorized',
  fieldErrors: {},
  formError: 'Your session or access has changed. Sign in again or contact your administrator before continuing.',
});

function parseSubmissionForm(form: FormData) {
  if (!(form instanceof FormData)) {
    return {
      success: false as const,
      fieldErrors: {} as IntakeFieldErrors,
      formError: 'Please check the form and try again.',
    };
  }

  const entries = [...form.entries()];
  if (
    new Set(entries.map(([key]) => key)).size !== entries.length
    || entries.some(([key]) => !ALLOWED_FORM_FIELDS.has(key))
  ) {
    return {
      success: false as const,
      fieldErrors: {} as IntakeFieldErrors,
      formError: 'Please check the form and try again.',
    };
  }

  return parseComplaintIntake(Object.fromEntries(
    INTAKE_FIELD_NAMES.map((name) => [name, form.get(name)]),
  ));
}

export async function submitComplaintIntake(
  input: SubmissionInput,
  { persist }: SubmissionDependencies,
): Promise<IntakeSubmissionResult> {
  const parsed = parseSubmissionForm(input.form);
  if (!parsed.success) {
    return {
      status: 'invalid',
      fieldErrors: parsed.fieldErrors,
      formError: parsed.formError,
    };
  }

  const privacy = parseComplaintIntakePrivacy(
    input.channel === 'public_web' ? 'public' : 'assisted',
    input.form,
  );
  if (!privacy.ok) {
    return {
      status: 'invalid',
      fieldErrors: {},
      formError: privacy.message,
    };
  }

  const scope = input.scope.trim();
  if (!scope) {
    return input.channel === 'assisted_internal' ? unauthorized() : unavailable();
  }

  if (input.channel === 'public_web' && input.actorId !== null) {
    return unavailable();
  }

  if (input.channel === 'assisted_internal' && !input.actorId) {
    return unauthorized();
  }

  if (!UUID_V4.test(input.idempotencyKey)) {
    return unavailable();
  }

  const idempotencyKeyHash = createHash('sha256')
    .update(input.idempotencyKey)
    .digest('hex');

  try {
    const persisted = await persist({
      channel: input.channel,
      scope,
      actorId: input.actorId,
      idempotencyKeyHash,
      complaint: parsed.data,
      privacy: privacy.evidence,
    });

    if (!RECEIPT_REFERENCE.test(persisted.receiptReference)) {
      return unavailable();
    }

    return {
      status: 'submitted',
      fieldErrors: {},
      receiptReference: persisted.receiptReference,
      duplicate: persisted.duplicate,
    };
  } catch {
    return unavailable();
  }
}

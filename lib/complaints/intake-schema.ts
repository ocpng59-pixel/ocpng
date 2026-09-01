import { z } from 'zod';

export const INTAKE_FIELDS = {
  complainantName: { label: 'Complainant name', maxLength: 200, required: true },
  email: { label: 'Email', maxLength: 254, required: false },
  phone: { label: 'Phone', maxLength: 40, required: false },
  postalAddress: { label: 'Postal address', maxLength: 1000, required: false },
  governmentBody: { label: 'Government body or agency', maxLength: 200, required: true },
  respondent: { label: 'Person or office concerned', maxLength: 200, required: false },
  subject: { label: 'Complaint subject', maxLength: 200, required: true },
  allegation: { label: 'What happened?', maxLength: 5000, required: true },
} as const;

export type IntakeField = keyof typeof INTAKE_FIELDS;
export type IntakeFieldErrors = Partial<Record<IntakeField, string>>;

function textField(field: IntakeField) {
  const { label, maxLength, required } = INTAKE_FIELDS[field];
  const schema = z.string({ error: `Enter ${label.toLowerCase()}.` }).trim()
    .max(maxLength, { error: `Use ${maxLength} characters or fewer.` });
  return required
    ? schema.min(1, { error: `Enter ${label.toLowerCase()}.` })
    : schema.default('');
}

export const complaintIntakeSchema = z.strictObject({
  complainantName: textField('complainantName'),
  email: textField('email').refine(
    (value) => !value || z.email().safeParse(value).success,
    { error: 'Enter a valid email address.' },
  ),
  phone: textField('phone').refine(
    (value) => !value || (/^\+?[\d\s().-]+$/.test(value) && /^\d{7,15}$/.test(value.replace(/\D/g, ''))),
    { error: 'Enter a phone number with 7 to 15 digits; a country code and spaces are allowed.' },
  ),
  postalAddress: textField('postalAddress'),
  governmentBody: textField('governmentBody'),
  respondent: textField('respondent'),
  subject: textField('subject'),
  allegation: textField('allegation'),
}).refine((data) => Boolean(data.email || data.phone || data.postalAddress), {
  path: ['email'],
  error: 'Enter an email, phone number or postal address so the complainant can be contacted.',
});

export type ComplaintIntake = z.infer<typeof complaintIntakeSchema>;
type IntakeParseResult =
  | { success: true; data: ComplaintIntake }
  | { success: false; fieldErrors: IntakeFieldErrors; formError: string };

export type IntakeCheckResult = {
  status: 'valid' | 'invalid' | 'unavailable' | 'unauthorized';
  fieldErrors: IntakeFieldErrors;
  formError?: string;
};

export function parseComplaintIntake(input: unknown): IntakeParseResult {
  const result = complaintIntakeSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };

  const fieldErrors: IntakeFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && Object.hasOwn(INTAKE_FIELDS, field)) {
      fieldErrors[field as IntakeField] ??= issue.message;
    }
  }
  return { success: false, fieldErrors, formError: 'Please check the form and correct the highlighted details.' };
}

// Shared by the browser and server. Never return complaint values to the caller.
export function checkComplaintIntakeForm(input: FormData): IntakeCheckResult {
  const invalid: IntakeCheckResult = {
    status: 'invalid', fieldErrors: {}, formError: 'Please check the form and try again.',
  };
  if (!(input instanceof FormData)) return invalid;
  const entries = [...input.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return invalid;
  const result = parseComplaintIntake(Object.fromEntries(entries));
  return result.success
    ? { status: 'valid', fieldErrors: {} }
    : { status: 'invalid', fieldErrors: result.fieldErrors, formError: result.formError };
}

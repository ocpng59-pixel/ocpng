import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  submitAssistedIntake,
  submitPublicIntake,
} from '@/app/complaints/intake/actions';

const { submissionEnabled, persistSubmission, resolveAssistedContext } = vi.hoisted(() => ({
  submissionEnabled: vi.fn(),
  persistSubmission: vi.fn(),
  resolveAssistedContext: vi.fn(),
}));

vi.mock('@/lib/config/server-environment', () => ({
  isComplaintSubmissionEnabled: submissionEnabled,
}));
vi.mock('@/lib/complaints/intake-submission-server', () => ({
  persistComplaintSubmission: persistSubmission,
  resolveAssistedSubmissionContext: resolveAssistedContext,
}));

const idempotencyKey = 'd72ef489-5374-4be9-82d8-8f2cebc15c34';
const receipt = 'OC-RCP-2026-A7F19C3E5D82B641';
const actorId = '65000000-0000-4000-8000-000000000001';

function validForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    complainantName: 'DEMO Applicant',
    email: 'demo@example.invalid',
    phone: '',
    postalAddress: '',
    governmentBody: 'DEMO Department',
    respondent: 'DEMO Officer',
    subject: 'DEMO Matter',
    allegation: 'DEMO allegation only',
  })) form.append(key, value);
  return form;
}

beforeEach(() => {
  submissionEnabled.mockReset();
  persistSubmission.mockReset();
  resolveAssistedContext.mockReset();
  submissionEnabled.mockReturnValue(true);
  persistSubmission.mockResolvedValue({ receiptReference: receipt, duplicate: false });
  resolveAssistedContext.mockResolvedValue({ actorId, scope: 'UAT-COMPLAINTS' });
});

describe('WASDOK-65 server submission actions', () => {
  it('keeps both submission paths unavailable while the production activation gate is off', async () => {
    submissionEnabled.mockReturnValue(false);

    const publicResult = await submitPublicIntake(validForm(), idempotencyKey);
    const assistedResult = await submitAssistedIntake(validForm(), idempotencyKey);

    expect(publicResult).toEqual({
      status: 'unavailable',
      fieldErrors: {},
      formError: 'Complaint submission is not enabled yet.',
    });
    expect(assistedResult).toEqual(publicResult);
    expect(persistSubmission).not.toHaveBeenCalled();
    expect(resolveAssistedContext).not.toHaveBeenCalled();
  });

  it('fixes public provenance on the server and returns only the controlled receipt result', async () => {
    const result = await submitPublicIntake(validForm(), idempotencyKey);

    expect(result).toEqual({
      status: 'submitted', fieldErrors: {}, receiptReference: receipt, duplicate: false,
    });
    expect(resolveAssistedContext).not.toHaveBeenCalled();
    expect(persistSubmission).toHaveBeenCalledTimes(1);
    expect(persistSubmission.mock.calls[0][0]).toMatchObject({
      channel: 'public_web',
      scope: 'OCPNG',
      actorId: null,
      complaint: { subject: 'DEMO Matter' },
    });
    expect(JSON.stringify(result)).not.toMatch(/DEMO Applicant|DEMO allegation/);
  });

  it('uses only the verified server-derived actor and scope for assisted submission', async () => {
    const result = await submitAssistedIntake(validForm(), idempotencyKey);

    expect(result.status).toBe('submitted');
    expect(resolveAssistedContext).toHaveBeenCalledTimes(1);
    expect(persistSubmission).toHaveBeenCalledTimes(1);
    expect(persistSubmission.mock.calls[0][0]).toMatchObject({
      channel: 'assisted_internal',
      scope: 'UAT-COMPLAINTS',
      actorId,
    });
  });

  it('denies assisted submission when the verified server context is unavailable', async () => {
    resolveAssistedContext.mockResolvedValue(null);

    const result = await submitAssistedIntake(validForm(), idempotencyKey);

    expect(result).toEqual({
      status: 'unauthorized',
      fieldErrors: {},
      formError: 'Your session or access has changed. Sign in again or contact your administrator before continuing.',
    });
    expect(persistSubmission).not.toHaveBeenCalled();
  });

  it('returns a generic retryable result when trusted persistence fails', async () => {
    persistSubmission.mockRejectedValue(new Error('DEMO database detail and complaint content'));

    const result = await submitPublicIntake(validForm(), idempotencyKey);

    expect(result).toEqual({
      status: 'unavailable',
      fieldErrors: {},
      formError: 'Unable to submit the complaint right now. Please try again.',
    });
    expect(JSON.stringify(result)).not.toMatch(/DEMO|database detail/);
  });
});

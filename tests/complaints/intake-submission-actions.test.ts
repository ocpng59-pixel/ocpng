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

function validForm(privacy: Record<string, string> = { privacyAcknowledged: 'yes' }) {
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
    ...privacy,
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

describe('WASDOK-65/66 server submission actions', () => {
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

  it('requires public acknowledgement before trusted persistence', async () => {
    const result = await submitPublicIntake(validForm({}), idempotencyKey);

    expect(result).toEqual({
      status: 'invalid',
      fieldErrors: {},
      formError: 'You must read and acknowledge the Privacy Notice before submitting your complaint.',
    });
    expect(persistSubmission).not.toHaveBeenCalled();
  });

  it('fixes public provenance and minimal privacy evidence on the server', async () => {
    const result = await submitPublicIntake(validForm({
      privacyAcknowledged: 'yes',
      privacyNoticeVersion: 'forged-browser-version',
      privacyAcknowledgedAt: '1999-01-01T00:00:00Z',
    }), idempotencyKey);

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
      privacy: {
        noticeVersion: 'OCPNG-COMPLAINT-PRIVACY-v1',
        acknowledgementRequired: true,
        method: 'public_checkbox',
        notRequiredReason: null,
      },
    });
    expect(JSON.stringify(persistSubmission.mock.calls[0][0].privacy)).not.toMatch(/1999|forged|DEMO Applicant/);
    expect(JSON.stringify(result)).not.toMatch(/DEMO Applicant|DEMO allegation/);
  });

  it('uses only the verified server actor/scope and assisted acknowledgement evidence', async () => {
    const result = await submitAssistedIntake(validForm(), idempotencyKey);

    expect(result.status).toBe('submitted');
    expect(resolveAssistedContext).toHaveBeenCalledTimes(1);
    expect(persistSubmission).toHaveBeenCalledTimes(1);
    expect(persistSubmission.mock.calls[0][0]).toMatchObject({
      channel: 'assisted_internal',
      scope: 'UAT-COMPLAINTS',
      actorId,
      privacy: {
        noticeVersion: 'OCPNG-COMPLAINT-PRIVACY-v1',
        acknowledgementRequired: true,
        method: 'assisted_acknowledgement',
        notRequiredReason: null,
      },
    });
  });

  it('supports the approved assisted acknowledgement-not-required path', async () => {
    const result = await submitAssistedIntake(validForm({
      privacyNotRequiredReason: 'formal_correspondence_already_received',
    }), idempotencyKey);

    expect(result.status).toBe('submitted');
    expect(persistSubmission).toHaveBeenCalledTimes(1);
    expect(persistSubmission.mock.calls[0][0]).toMatchObject({
      privacy: {
        noticeVersion: 'OCPNG-COMPLAINT-PRIVACY-v1',
        acknowledgementRequired: false,
        method: 'not_required',
        notRequiredReason: 'formal_correspondence_already_received',
      },
    });
  });

  it('rejects unapproved assisted acknowledgement-not-required reasons', async () => {
    const result = await submitAssistedIntake(validForm({
      privacyNotRequiredReason: 'browser-invented-reason',
    }), idempotencyKey);

    expect(result).toEqual({
      status: 'invalid',
      fieldErrors: {},
      formError: 'Record the complainant privacy acknowledgement or select an approved reason why acknowledgement is not required.',
    });
    expect(persistSubmission).not.toHaveBeenCalled();
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

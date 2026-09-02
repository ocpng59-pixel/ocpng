import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  submitComplaintIntake,
  type PersistComplaintSubmission,
} from '@/lib/complaints/intake-submission';

function validForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    complainantName: '  DEMO Applicant  ',
    email: 'demo@example.invalid',
    phone: '',
    postalAddress: '',
    governmentBody: ' DEMO Department ',
    respondent: ' DEMO Officer ',
    subject: ' DEMO Matter ',
    allegation: ' DEMO allegation only ',
  })) form.append(key, value);
  return form;
}

const idempotencyKey = 'd72ef489-5374-4be9-82d8-8f2cebc15c34';
const expectedHash = createHash('sha256').update(idempotencyKey).digest('hex');
const receipt = 'OC-RCP-2026-A7F19C3E5D82B641';

describe('WASDOK-65 trusted complaint submission orchestration', () => {
  it('validates, normalizes, hashes the retry token and returns only a controlled receipt', async () => {
    const persist = vi.fn(async (_input: PersistComplaintSubmission) => ({
      receiptReference: receipt,
      duplicate: false,
    }));

    const result = await submitComplaintIntake({
      form: validForm(),
      idempotencyKey,
      channel: 'public_web',
      scope: 'OCPNG',
      actorId: null,
    }, { persist });

    expect(result).toEqual({
      status: 'submitted',
      fieldErrors: {},
      receiptReference: receipt,
      duplicate: false,
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith({
      channel: 'public_web',
      scope: 'OCPNG',
      actorId: null,
      idempotencyKeyHash: expectedHash,
      complaint: {
        complainantName: 'DEMO Applicant',
        email: 'demo@example.invalid',
        phone: '',
        postalAddress: '',
        governmentBody: 'DEMO Department',
        respondent: 'DEMO Officer',
        subject: 'DEMO Matter',
        allegation: 'DEMO allegation only',
      },
    });
    expect(JSON.stringify(persist.mock.calls[0][0])).not.toContain(idempotencyKey);
    expect(JSON.stringify(result)).not.toContain('DEMO Applicant');
    expect(JSON.stringify(result)).not.toContain('DEMO allegation only');
  });

  it('returns the same safe receipt result when the database reports an idempotent retry', async () => {
    const persist = vi.fn(async () => ({ receiptReference: receipt, duplicate: true }));

    const result = await submitComplaintIntake({
      form: validForm(), idempotencyKey,
      channel: 'public_web', scope: 'OCPNG', actorId: null,
    }, { persist });

    expect(result).toEqual({
      status: 'submitted', fieldErrors: {}, receiptReference: receipt, duplicate: true,
    });
  });

  it('rejects invalid complaint fields before persistence and does not echo complaint values', async () => {
    const form = validForm();
    form.set('allegation', '');
    const persist = vi.fn();

    const result = await submitComplaintIntake({
      form, idempotencyKey,
      channel: 'public_web', scope: 'OCPNG', actorId: null,
    }, { persist });

    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') throw new Error('Expected invalid result');
    expect(result.fieldErrors.allegation).toBeTruthy();
    expect(persist).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('DEMO Applicant');
  });

  it('rejects repeated FormData keys before persistence', async () => {
    const form = validForm();
    form.append('subject', 'second subject');
    const persist = vi.fn();

    const result = await submitComplaintIntake({
      form, idempotencyKey,
      channel: 'public_web', scope: 'OCPNG', actorId: null,
    }, { persist });

    expect(result.status).toBe('invalid');
    expect(persist).not.toHaveBeenCalled();
  });

  it('fails closed on a malformed idempotency token without exposing it', async () => {
    const persist = vi.fn();
    const malformed = 'predictable-token';

    const result = await submitComplaintIntake({
      form: validForm(), idempotencyKey: malformed,
      channel: 'public_web', scope: 'OCPNG', actorId: null,
    }, { persist });

    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') throw new Error('Expected unavailable result');
    expect(result.formError).toBe('Unable to submit the complaint right now. Please try again.');
    expect(JSON.stringify(result)).not.toContain(malformed);
    expect(persist).not.toHaveBeenCalled();
  });

  it('requires a server-derived actor for assisted intake', async () => {
    const persist = vi.fn();

    const result = await submitComplaintIntake({
      form: validForm(), idempotencyKey,
      channel: 'assisted_internal', scope: 'UAT-COMPLAINTS', actorId: null,
    }, { persist });

    expect(result).toEqual({
      status: 'unauthorized', fieldErrors: {},
      formError: 'Your session or access has changed. Sign in again or contact your administrator before continuing.',
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it('fails closed on a blank server-derived scope', async () => {
    const persist = vi.fn();

    const result = await submitComplaintIntake({
      form: validForm(), idempotencyKey,
      channel: 'assisted_internal', scope: '   ',
      actorId: '65000000-0000-4000-8000-000000000001',
    }, { persist });

    expect(result.status).toBe('unauthorized');
    expect(persist).not.toHaveBeenCalled();
  });

  it('converts persistence failures to a generic retryable response without complaint content', async () => {
    const persist = vi.fn(async () => {
      throw new Error('database details DEMO Applicant DEMO allegation only');
    });

    const result = await submitComplaintIntake({
      form: validForm(), idempotencyKey,
      channel: 'public_web', scope: 'OCPNG', actorId: null,
    }, { persist });

    expect(result).toEqual({
      status: 'unavailable', fieldErrors: {},
      formError: 'Unable to submit the complaint right now. Please try again.',
    });
    expect(JSON.stringify(result)).not.toContain('DEMO Applicant');
    expect(JSON.stringify(result)).not.toContain('database details');
  });

  it('rejects an unexpected database receipt instead of returning an uncontrolled reference', async () => {
    const persist = vi.fn(async () => ({ receiptReference: 'sequential-1', duplicate: false }));

    const result = await submitComplaintIntake({
      form: validForm(), idempotencyKey,
      channel: 'public_web', scope: 'OCPNG', actorId: null,
    }, { persist });

    expect(result.status).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('sequential-1');
  });
});

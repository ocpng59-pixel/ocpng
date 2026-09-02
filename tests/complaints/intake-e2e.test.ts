import { createHash, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { submitPublicIntake } from '@/app/complaints/intake/actions';

const describeE2E = process.env.WASDOK67_COMPLAINT_E2E === 'true'
  ? describe
  : describe.skip;

function validPublicForm() {
  const form = new FormData();
  form.set('complainantName', 'DEMO WASDOK67 Applicant');
  form.set('email', 'wasdok67-applicant@test.invalid');
  form.set('phone', '');
  form.set('postalAddress', '');
  form.set('governmentBody', 'DEMO WASDOK67 Agency');
  form.set('respondent', 'DEMO WASDOK67 Officer');
  form.set('subject', 'DEMO WASDOK67 End-to-End Matter');
  form.set('allegation', 'DEMO WASDOK67 allegation for local integration testing only');
  form.set('privacyAcknowledged', 'yes');
  return form;
}

function serviceClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('WASDOK-67 local Supabase environment is unavailable.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function exactCount(service: SupabaseClient, table: string) {
  const { count, error } = await service.from(table).select('*', { count: 'exact', head: true });
  expect(error).toBeNull();
  expect(count).not.toBeNull();
  return count!;
}

describeE2E('WASDOK-67 complaint intake end-to-end', () => {
  it('submits a valid public complaint through the server action and creates the authoritative audit chain', async () => {
    const idempotencyKey = randomUUID();
    const idempotencyKeyHash = createHash('sha256').update(idempotencyKey).digest('hex');

    const result = await submitPublicIntake(validPublicForm(), idempotencyKey);

    expect(result.status).toBe('submitted');
    if (result.status !== 'submitted') return;
    expect(result.receiptReference).toMatch(/^OC-RCP-[0-9]{4}-[A-F0-9]{16}$/);
    expect(result.duplicate).toBe(false);

    const service = serviceClient();
    const { data: intake, error: intakeError } = await service
      .from('complaint_intakes')
      .select('id,status,revision,channel,source,actor_id,organisation_scope,receipt_reference,submitted_at,complainant_name,email,government_body,respondent,subject,allegation')
      .eq('idempotency_key_hash', idempotencyKeyHash)
      .single();

    expect(intakeError).toBeNull();
    expect(intake).toMatchObject({
      status: 'submitted',
      revision: 2,
      channel: 'public_web',
      source: 'wasdok_public_form',
      actor_id: null,
      organisation_scope: 'OCPNG',
      receipt_reference: result.receiptReference,
      complainant_name: 'DEMO WASDOK67 Applicant',
      email: 'wasdok67-applicant@test.invalid',
      government_body: 'DEMO WASDOK67 Agency',
      respondent: 'DEMO WASDOK67 Officer',
      subject: 'DEMO WASDOK67 End-to-End Matter',
      allegation: 'DEMO WASDOK67 allegation for local integration testing only',
    });
    expect(intake?.submitted_at).toBeTruthy();

    const { data: privacyEvidence, error: privacyError } = await service
      .from('complaint_intake_privacy_evidence')
      .select('notice_version,acknowledgement_required,acknowledgement_method,not_required_reason,acknowledged_at,recorded_at,recorded_by')
      .eq('intake_id', intake!.id)
      .single();

    expect(privacyError).toBeNull();
    expect(privacyEvidence).toMatchObject({
      notice_version: 'OCPNG-COMPLAINT-PRIVACY-v1',
      acknowledgement_required: true,
      acknowledgement_method: 'public_checkbox',
      not_required_reason: null,
      recorded_by: null,
    });
    expect(privacyEvidence?.acknowledged_at).toBeTruthy();
    expect(privacyEvidence?.recorded_at).toBeTruthy();

    const { data: auditEvents, error: auditError } = await service
      .from('audit_events')
      .select('action,request_metadata,before_data,after_data,metadata')
      .eq('entity_id', intake!.id)
      .order('created_at', { ascending: true });

    expect(auditError).toBeNull();
    expect(auditEvents?.map((event) => event.action)).toEqual([
      'complaint_intake.draft_created',
      'complaint_intake.privacy_recorded',
      'complaint_intake.submitted',
    ]);
    expect(auditEvents?.every((event) => (
      event.request_metadata?.channel === 'public_web'
      && event.request_metadata?.source === 'wasdok_public_form'
    ))).toBe(true);

    const serializedAudit = JSON.stringify(auditEvents);
    expect(serializedAudit).not.toMatch(/DEMO WASDOK67 Applicant/);
    expect(serializedAudit).not.toMatch(/wasdok67-applicant@test\.invalid/);
    expect(serializedAudit).not.toMatch(/DEMO WASDOK67 allegation/);
    expect(serializedAudit).not.toContain(idempotencyKeyHash);
    expect(serializedAudit).not.toContain(result.receiptReference);
  });

  it('rejects a partial complaint before persistence and creates no intake, privacy evidence or audit event', async () => {
    const service = serviceClient();
    const beforeIntakes = await exactCount(service, 'complaint_intakes');
    const beforePrivacy = await exactCount(service, 'complaint_intake_privacy_evidence');
    const beforeAudit = await exactCount(service, 'audit_events');

    const idempotencyKey = randomUUID();
    const idempotencyKeyHash = createHash('sha256').update(idempotencyKey).digest('hex');
    const form = validPublicForm();
    form.set('allegation', '');

    const result = await submitPublicIntake(form, idempotencyKey);

    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.fieldErrors.allegation).toBeTruthy();

    const { count: matchingIntakes, error: matchingError } = await service
      .from('complaint_intakes')
      .select('id', { count: 'exact', head: true })
      .eq('idempotency_key_hash', idempotencyKeyHash);
    expect(matchingError).toBeNull();
    expect(matchingIntakes).toBe(0);

    expect(await exactCount(service, 'complaint_intakes')).toBe(beforeIntakes);
    expect(await exactCount(service, 'complaint_intake_privacy_evidence')).toBe(beforePrivacy);
    expect(await exactCount(service, 'audit_events')).toBe(beforeAudit);
  });

  it('returns the same receipt for an exact retry without duplicating intake, privacy or audit evidence', async () => {
    const service = serviceClient();
    const idempotencyKey = randomUUID();
    const idempotencyKeyHash = createHash('sha256').update(idempotencyKey).digest('hex');
    const form = validPublicForm();

    const first = await submitPublicIntake(form, idempotencyKey);
    expect(first.status).toBe('submitted');
    if (first.status !== 'submitted') return;
    expect(first.duplicate).toBe(false);

    const retry = await submitPublicIntake(form, idempotencyKey);
    expect(retry.status).toBe('submitted');
    if (retry.status !== 'submitted') return;
    expect(retry.duplicate).toBe(true);
    expect(retry.receiptReference).toBe(first.receiptReference);

    const { data: intakeRows, error: intakeError } = await service
      .from('complaint_intakes')
      .select('id')
      .eq('idempotency_key_hash', idempotencyKeyHash);
    expect(intakeError).toBeNull();
    expect(intakeRows).toHaveLength(1);

    const intakeId = intakeRows![0].id;
    const { count: privacyCount, error: privacyError } = await service
      .from('complaint_intake_privacy_evidence')
      .select('id', { count: 'exact', head: true })
      .eq('intake_id', intakeId);
    expect(privacyError).toBeNull();
    expect(privacyCount).toBe(1);

    const { data: auditEvents, error: auditError } = await service
      .from('audit_events')
      .select('action')
      .eq('entity_id', intakeId);
    expect(auditError).toBeNull();
    expect(auditEvents).toHaveLength(3);
    expect(auditEvents?.filter((event) => event.action === 'complaint_intake.draft_created')).toHaveLength(1);
    expect(auditEvents?.filter((event) => event.action === 'complaint_intake.privacy_recorded')).toHaveLength(1);
    expect(auditEvents?.filter((event) => event.action === 'complaint_intake.submitted')).toHaveLength(1);
  });

  it('rejects changed content under a used idempotency key and leaves the authoritative submission unchanged', async () => {
    const service = serviceClient();
    const idempotencyKey = randomUUID();
    const idempotencyKeyHash = createHash('sha256').update(idempotencyKey).digest('hex');
    const originalForm = validPublicForm();

    const first = await submitPublicIntake(originalForm, idempotencyKey);
    expect(first.status).toBe('submitted');
    if (first.status !== 'submitted') return;

    const changedForm = validPublicForm();
    changedForm.set('allegation', 'DEMO WASDOK67 CHANGED allegation that must not replace the submitted record');
    const changed = await submitPublicIntake(changedForm, idempotencyKey);

    expect(changed).toEqual({
      status: 'unavailable',
      fieldErrors: {},
      formError: 'Unable to submit the complaint right now. Please try again.',
    });
    expect(JSON.stringify(changed)).not.toMatch(/CHANGED|submitted record/);

    const { data: intake, error: intakeError } = await service
      .from('complaint_intakes')
      .select('id,status,revision,receipt_reference,allegation')
      .eq('idempotency_key_hash', idempotencyKeyHash)
      .single();
    expect(intakeError).toBeNull();
    expect(intake).toMatchObject({
      status: 'submitted',
      revision: 2,
      receipt_reference: first.receiptReference,
      allegation: 'DEMO WASDOK67 allegation for local integration testing only',
    });

    const { data: auditEvents, error: auditError } = await service
      .from('audit_events')
      .select('action')
      .eq('entity_id', intake!.id);
    expect(auditError).toBeNull();
    expect(auditEvents).toHaveLength(3);
  });
});

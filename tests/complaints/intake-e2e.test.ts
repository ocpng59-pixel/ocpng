import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
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

describeE2E('WASDOK-67 complaint intake end-to-end', () => {
  it('submits a valid public complaint through the server action and creates the authoritative audit chain', async () => {
    const idempotencyKey = randomUUID();
    const idempotencyKeyHash = createHash('sha256').update(idempotencyKey).digest('hex');

    const result = await submitPublicIntake(validPublicForm(), idempotencyKey);

    expect(result.status).toBe('submitted');
    if (result.status !== 'submitted') return;
    expect(result.receiptReference).toMatch(/^OC-RCP-[0-9]{4}-[A-F0-9]{16}$/);
    expect(result.duplicate).toBe(false);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(supabaseUrl).toBeTruthy();
    expect(serviceRoleKey).toBeTruthy();

    const service = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: intake, error: intakeError } = await service
      .from('complaint_intakes')
      .select('id,status,revision,channel,source,actor_id,organisation_scope,receipt_reference,submitted_at')
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

    const serializedAudit = JSON.stringify(auditEvents);
    expect(serializedAudit).not.toMatch(/DEMO WASDOK67 Applicant/);
    expect(serializedAudit).not.toMatch(/wasdok67-applicant@test\.invalid/);
    expect(serializedAudit).not.toMatch(/DEMO WASDOK67 allegation/);
    expect(serializedAudit).not.toContain(idempotencyKeyHash);
    expect(serializedAudit).not.toContain(result.receiptReference);
  });
});

import type {
  PersistComplaintSubmission,
  PersistComplaintSubmissionResult,
} from '@/lib/complaints/intake-submission';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AssistedSubmissionContext = {
  actorId: string;
  scope: string;
};

export async function persistComplaintSubmission(
  submission: PersistComplaintSubmission,
): Promise<PersistComplaintSubmissionResult> {
  try {
    const client = createServiceSupabaseClient();
    const { complaint } = submission;
    const { data, error } = await client.rpc('persist_complaint_intake_submission', {
      p_channel: submission.channel,
      p_scope: submission.scope,
      p_actor_id: submission.actorId,
      p_idempotency_key_hash: submission.idempotencyKeyHash,
      p_complainant_name: complaint.complainantName,
      p_email: complaint.email,
      p_phone: complaint.phone,
      p_postal_address: complaint.postalAddress,
      p_government_body: complaint.governmentBody,
      p_respondent: complaint.respondent,
      p_subject: complaint.subject,
      p_allegation: complaint.allegation,
    });

    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (
      error
      || !row
      || typeof row !== 'object'
      || typeof row.receipt_reference !== 'string'
      || typeof row.duplicate !== 'boolean'
    ) {
      throw new Error('persistence rejected');
    }

    return {
      receiptReference: row.receipt_reference,
      duplicate: row.duplicate,
    };
  } catch {
    throw new Error('Complaint persistence failed.');
  }
}

function claimSubject(claims: unknown): string | null {
  if (!claims || typeof claims !== 'object') return null;
  const subject = (claims as Record<string, unknown>).sub;
  return typeof subject === 'string' && UUID.test(subject) ? subject : null;
}

export async function resolveAssistedSubmissionContext(): Promise<AssistedSubmissionContext | null> {
  try {
    const client = await createServerSupabaseClient();
    if (!client) return null;

    const { data: claimsData, error: claimsError } = await client.auth.getClaims();
    if (claimsError) return null;
    const actorId = claimSubject(claimsData?.claims);
    if (!actorId) return null;

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('organisation_scope,is_active')
      .eq('id', actorId)
      .single();

    if (profileError || !profile || profile.is_active !== true) return null;
    const scope = typeof profile.organisation_scope === 'string'
      ? profile.organisation_scope.trim()
      : '';
    if (!scope) return null;

    const [permission, compartment, scopeAccess] = await Promise.all([
      client.rpc('has_permission', { permission_code: 'complaints.create' }),
      client.rpc('has_compartment', { classification_code: 'CONFIDENTIAL' }),
      client.rpc('has_scope', { scope_code: scope }),
    ]);

    if (
      permission.error || permission.data !== true
      || compartment.error || compartment.data !== true
      || scopeAccess.error || scopeAccess.data !== true
    ) return null;

    return { actorId, scope };
  } catch {
    return null;
  }
}

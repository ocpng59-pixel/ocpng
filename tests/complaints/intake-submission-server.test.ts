import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistComplaintSubmission } from '@/lib/complaints/intake-submission';
import {
  persistComplaintSubmission,
  resolveAssistedSubmissionContext,
} from '@/lib/complaints/intake-submission-server';

const { createServiceClient, createServerClient } = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: createServiceClient }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: createServerClient }));

const actorId = '65000000-0000-4000-8000-000000000001';
const receipt = 'OC-RCP-2026-A7F19C3E5D82B641';

const submission: PersistComplaintSubmission = {
  channel: 'assisted_internal',
  scope: 'UAT-COMPLAINTS',
  actorId,
  idempotencyKeyHash: 'a'.repeat(64),
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
};

function authenticatedClient({
  claims = { sub: actorId },
  profile = { organisation_scope: ' UAT-COMPLAINTS ', is_active: true },
  profileError = null as unknown,
  decisions = { permission: true, compartment: true, scope: true },
} = {}) {
  const single = vi.fn(async () => ({ data: profile, error: profileError }));
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn(async (name: string) => {
    if (name === 'has_permission') return { data: decisions.permission, error: null };
    if (name === 'has_compartment') return { data: decisions.compartment, error: null };
    if (name === 'has_scope') return { data: decisions.scope, error: null };
    throw new Error('Unexpected authorization RPC');
  });
  return {
    client: {
      auth: { getClaims: vi.fn(async () => ({ data: { claims }, error: null })) },
      from,
      rpc,
    },
    from,
    select,
    eq,
    single,
    rpc,
  };
}

beforeEach(() => {
  createServiceClient.mockReset();
  createServerClient.mockReset();
});

describe('WASDOK-65 trusted Supabase persistence adapter', () => {
  it('maps only validated server data to the trusted persistence RPC and returns receipt metadata', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        intake_id: '66000000-0000-4000-8000-000000000001',
        receipt_reference: receipt,
        submitted_at: '2026-09-02T03:00:00Z',
        duplicate: false,
      }],
      error: null,
    }));
    createServiceClient.mockReturnValue({ rpc });

    await expect(persistComplaintSubmission(submission)).resolves.toEqual({
      receiptReference: receipt,
      duplicate: false,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('persist_complaint_intake_submission', {
      p_channel: 'assisted_internal',
      p_scope: 'UAT-COMPLAINTS',
      p_actor_id: actorId,
      p_idempotency_key_hash: 'a'.repeat(64),
      p_complainant_name: 'DEMO Applicant',
      p_email: 'demo@example.invalid',
      p_phone: '',
      p_postal_address: '',
      p_government_body: 'DEMO Department',
      p_respondent: 'DEMO Officer',
      p_subject: 'DEMO Matter',
      p_allegation: 'DEMO allegation only',
    });
  });

  it('converts database failures to a generic server error without echoing complaint content', async () => {
    createServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({ data: null, error: { message: 'DEMO Applicant secret database detail' } })),
    });

    let message = '';
    try {
      await persistComplaintSubmission(submission);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe('Complaint persistence failed.');
    expect(message).not.toMatch(/DEMO|secret|database detail/);
  });

  it('fails closed when the RPC does not return exactly one usable receipt row', async () => {
    createServiceClient.mockReturnValue({ rpc: vi.fn(async () => ({ data: [], error: null })) });
    await expect(persistComplaintSubmission(submission)).rejects.toThrow('Complaint persistence failed.');
  });
});

describe('WASDOK-65 assisted submission context', () => {
  it('derives the actor and organisation scope from the verified server session and profile', async () => {
    const setup = authenticatedClient();
    createServerClient.mockResolvedValue(setup.client);

    await expect(resolveAssistedSubmissionContext()).resolves.toEqual({
      actorId,
      scope: 'UAT-COMPLAINTS',
    });
    expect(setup.from).toHaveBeenCalledWith('profiles');
    expect(setup.select).toHaveBeenCalledWith('organisation_scope,is_active');
    expect(setup.eq).toHaveBeenCalledWith('id', actorId);
    expect(setup.rpc).toHaveBeenCalledWith('has_permission', { permission_code: 'complaints.create' });
    expect(setup.rpc).toHaveBeenCalledWith('has_compartment', { classification_code: 'CONFIDENTIAL' });
    expect(setup.rpc).toHaveBeenCalledWith('has_scope', { scope_code: 'UAT-COMPLAINTS' });
  });

  it('rejects a missing or malformed authenticated subject before profile access', async () => {
    for (const claims of [null, {}, { sub: 'not-a-uuid' }]) {
      const setup = authenticatedClient({ claims: claims as { sub: string } });
      createServerClient.mockResolvedValue(setup.client);
      await expect(resolveAssistedSubmissionContext()).resolves.toBeNull();
      expect(setup.from).not.toHaveBeenCalled();
      createServerClient.mockReset();
    }
  });

  it('rejects inactive profiles and blank server-derived scopes', async () => {
    for (const profile of [
      { organisation_scope: 'UAT-COMPLAINTS', is_active: false },
      { organisation_scope: '   ', is_active: true },
    ]) {
      const setup = authenticatedClient({ profile });
      createServerClient.mockResolvedValue(setup.client);
      await expect(resolveAssistedSubmissionContext()).resolves.toBeNull();
      expect(setup.rpc).not.toHaveBeenCalled();
      createServerClient.mockReset();
    }
  });

  it.each([
    ['permission', { permission: false, compartment: true, scope: true }],
    ['compartment', { permission: true, compartment: false, scope: true }],
    ['scope', { permission: true, compartment: true, scope: false }],
  ])('fails closed when the %s authorization gate fails', async (_name, decisions) => {
    const setup = authenticatedClient({ decisions });
    createServerClient.mockResolvedValue(setup.client);
    await expect(resolveAssistedSubmissionContext()).resolves.toBeNull();
  });

  it('fails closed on server/auth/profile errors without propagating internal details', async () => {
    createServerClient.mockRejectedValue(new Error('DEMO internal configuration secret'));
    await expect(resolveAssistedSubmissionContext()).resolves.toBeNull();
  });
});

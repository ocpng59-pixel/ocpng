import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkPublicIntake, checkAssistedIntake } from '@/app/complaints/intake/actions';
import AssistedIntakePage from '@/app/dashboard/complaints/new/page';
import { checkComplaintIntakeForm } from '@/lib/complaints/intake-schema';
import { intakeFormData, validIntake } from './intake-fixture';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: createClient }));

function client({ authenticated = true, permission = true, compartment = true, error = false } = {}) {
  return {
    auth: { getClaims: async () => ({ data: { claims: authenticated ? { sub: 'DEMO-officer' } : null }, error: null }) },
    rpc: async (name: string, args: Record<string, string>) => {
      if (error) throw new Error('DEMO backend details must stay private');
      if (name === 'has_permission' && args.permission_code === 'complaints.create') return { data: permission, error: null };
      if (name === 'has_compartment' && args.classification_code === 'CONFIDENTIAL') return { data: compartment, error: null };
      throw new Error('Unexpected authorization query');
    },
    // A validation-only flow must never read or write a complaint table.
    from: () => { throw new Error('Complaint persistence is outside WASDOK-63'); },
  };
}

beforeEach(() => { createClient.mockReset(); createClient.mockResolvedValue(client()); });

describe('direct intake server actions', () => {
  it('checks public input without an authenticated client or database access', async () => {
    createClient.mockRejectedValue(new Error('Public form must not create a database client'));
    expect(await checkPublicIntake(intakeFormData())).toEqual({ status: 'valid', fieldErrors: {} });
  });

  it.each(['complainantName', 'governmentBody', 'subject', 'allegation', 'email'])
    ('rejects invalid %s even when client-side checks are bypassed', async (field) => {
      const form = intakeFormData({ ...validIntake, [field]: '' });
      const expected = checkComplaintIntakeForm(form);
      expect(expected.status).toBe('invalid');
      expect(await checkPublicIntake(form)).toEqual(expected);
      expect(await checkAssistedIntake(form)).toEqual(expected);
    });

  it('checks assisted intake for an authorized officer without storing values', async () => {
    expect(await checkAssistedIntake(intakeFormData())).toEqual({ status: 'valid', fieldErrors: {} });
  });

  it.each([
    ['signed out', { authenticated: false }],
    ['no create permission', { permission: false }],
    ['no confidential compartment', { compartment: false }],
    ['authorization service failure', { error: true }],
  ])('denies assisted page and direct action with %s', async (_name, options) => {
    createClient.mockResolvedValue(client(options));
    await expect(AssistedIntakePage()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    const result = await checkAssistedIntake(intakeFormData());
    expect(result.status).toBe('unauthorized');
    expect(JSON.stringify(result)).not.toMatch(/DEMO|backend|claims|rpc/);
  });

  it('fails closed when configuration/client creation fails', async () => {
    createClient.mockRejectedValue(new Error('DEMO internal configuration'));
    expect((await checkAssistedIntake(intakeFormData())).status).toBe('unauthorized');
  });

  it('rejects a session lost after the page was opened', async () => {
    expect(await AssistedIntakePage()).toBeTruthy();
    createClient.mockResolvedValue(client({ authenticated: false }));
    expect((await checkAssistedIntake(intakeFormData())).status).toBe('unauthorized');
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getServiceSupabaseConfiguration,
  isComplaintSubmissionEnabled,
} from '@/lib/config/server-environment';

function jwt(role: string) {
  const encoded = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ role })}.signature`;
}

describe('WASDOK-65 privileged Supabase server boundary', () => {
  it('keeps complaint persistence disabled unless explicitly enabled', () => {
    expect(isComplaintSubmissionEnabled({})).toBe(false);
    expect(isComplaintSubmissionEnabled({ OCPNG_COMPLAINT_SUBMISSION_ENABLED: 'false' })).toBe(false);
    expect(isComplaintSubmissionEnabled({ OCPNG_COMPLAINT_SUBMISSION_ENABLED: 'TRUE' })).toBe(false);
    expect(isComplaintSubmissionEnabled({ OCPNG_COMPLAINT_SUBMISSION_ENABLED: 'true' })).toBe(true);
  });

  it('accepts a modern Supabase secret key only in server configuration', () => {
    expect(getServiceSupabaseConfiguration({
      NEXT_PUBLIC_SUPABASE_URL: 'https://demo.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_DEMO_ONLY_NOT_REAL',
    })).toEqual({
      supabaseUrl: 'https://demo.supabase.co',
      serviceRoleKey: 'sb_secret_DEMO_ONLY_NOT_REAL',
    });
  });

  it('accepts a legacy JWT only when its role is service_role', () => {
    expect(getServiceSupabaseConfiguration({
      NEXT_PUBLIC_SUPABASE_URL: 'https://demo.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'),
    }).serviceRoleKey).toBe(jwt('service_role'));
  });

  it.each([
    ['missing key', undefined],
    ['publishable key', 'sb_publishable_DEMO_ONLY_NOT_REAL'],
    ['anonymous JWT', jwt('anon')],
    ['arbitrary value', 'not-a-supabase-key'],
  ])('fails closed for %s without echoing credential material', (_name, key) => {
    const invoke = () => getServiceSupabaseConfiguration({
      NEXT_PUBLIC_SUPABASE_URL: 'https://demo.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: key,
    });
    expect(invoke).toThrow('Privileged Supabase server configuration is unavailable.');
    try { invoke(); } catch (error) {
      expect(String(error)).not.toContain(key ?? 'undefined');
    }
  });

  it('fails closed when the project URL is unavailable', () => {
    expect(() => getServiceSupabaseConfiguration({
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_DEMO_ONLY_NOT_REAL',
    })).toThrow('Privileged Supabase server configuration is unavailable.');
  });

  it('marks the privileged Supabase client module server-only and disables session persistence', () => {
    const source = readFileSync('lib/supabase/service.ts', 'utf8');
    expect(source).toContain("import 'server-only'");
    expect(source).toContain('getServiceSupabaseConfiguration');
    expect(source).toMatch(/persistSession:\s*false/);
    expect(source).toMatch(/autoRefreshToken:\s*false/);
    expect(source).toMatch(/detectSessionInUrl:\s*false/);
    expect(source).not.toContain('NEXT_PUBLIC_SUPABASE_SERVICE');
  });

  it('keeps every Access Control UI component away from the privileged service client', () => {
    const clientBoundaryFiles = [
      'components/access-control/action-message.tsx',
      'components/access-control/role-form.tsx',
      'components/access-control/permission-matrix.tsx',
      'components/access-control/user-access-form.tsx',
      'components/access-control/user-invite-form.tsx',
    ];

    for (const file of clientBoundaryFiles) {
      expect(existsSync(file), `Expected ${file} to exist`).toBe(true);
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('@/lib/supabase/service');
      expect(source).not.toContain('lib/supabase/service');
      expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    }
  });
});

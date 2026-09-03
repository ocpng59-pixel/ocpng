import { describe, expect, it } from 'vitest';
import { getHealthRuntimeConfiguration } from '../../scripts/operations/lib/health-runtime-config.mjs';

const projectRef = 'abcdefghijklmnopqrst';
const serviceRoleKey = 'sb_secret_DEMO_SERVICE_ROLE_1234567890';

const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  OCPNG_SUPABASE_PROJECT_REF: projectRef,
  OCPNG_SUPABASE_HEALTH_TOKEN: 'sbp_DEMO_HEALTH_TOKEN_1234567890',
  OCPNG_PUBLIC_APP_URL: 'https://wasdok.example.invalid',
};

describe('WASDOK-85 service-role project binding', () => {
  it('rejects a Supabase URL whose hostname does not match the configured project ref', () => {
    for (const unsafeUrl of [
      'https://attacker.example.invalid',
      `https://${projectRef}.supabase.co.attacker.example.invalid`,
      `https://${projectRef}.supabase.co/alternate-path`,
    ]) {
      try {
        getHealthRuntimeConfiguration({
          ...validEnv,
          NEXT_PUBLIC_SUPABASE_URL: unsafeUrl,
        });
        throw new Error('expected project-bound Supabase URL rejection');
      } catch (error) {
        expect(String(error)).toContain('System health runtime configuration is unavailable.');
        expect(String(error)).not.toContain(unsafeUrl);
        expect(String(error)).not.toContain(serviceRoleKey);
      }
    }
  });
});

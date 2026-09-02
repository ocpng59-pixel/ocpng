import { describe, expect, it } from 'vitest';
import { getBackupOperationsConfiguration } from '@/lib/config/server-environment';
import { validateBackupReason, validateRecoveryTimeUnix } from '@/lib/operations/backups/validation';

const validEnvironment = {
  OCPNG_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  OCPNG_SUPABASE_MANAGEMENT_TOKEN: 'sbp_DEMO_MANAGEMENT_TOKEN_1234567890',
  OCPNG_BACKUP_DATABASE_URL: 'postgresql://demo:demo@127.0.0.1:5432/postgres',
  OCPNG_BACKUP_BUCKET: 'wasdok-system-backups',
  OCPNG_BACKUP_KEY_REF: 'kms://ocpng/wasdok-backup-key',
};

describe('WASDOK-55 backup operations server configuration', () => {
  it('accepts a complete server-only configuration', () => {
    expect(getBackupOperationsConfiguration(validEnvironment)).toEqual({
      projectRef: 'abcdefghijklmnopqrst',
      managementToken: 'sbp_DEMO_MANAGEMENT_TOKEN_1234567890',
      databaseUrl: 'postgresql://demo:demo@127.0.0.1:5432/postgres',
      backupBucket: 'wasdok-system-backups',
      keyRef: 'kms://ocpng/wasdok-backup-key',
    });
  });

  it.each([
    'OCPNG_SUPABASE_PROJECT_REF',
    'OCPNG_SUPABASE_MANAGEMENT_TOKEN',
    'OCPNG_BACKUP_DATABASE_URL',
    'OCPNG_BACKUP_BUCKET',
    'OCPNG_BACKUP_KEY_REF',
  ] as const)('fails closed when %s is missing', (key) => {
    const source = { ...validEnvironment, [key]: undefined };
    expect(() => getBackupOperationsConfiguration(source)).toThrow(
      'Backup operations server configuration is unavailable.',
    );
  });

  it.each([
    ['bad project ref', { OCPNG_SUPABASE_PROJECT_REF: 'INVALID REF' }],
    ['short management token', { OCPNG_SUPABASE_MANAGEMENT_TOKEN: 'short' }],
    ['non-postgres database URL', { OCPNG_BACKUP_DATABASE_URL: 'https://example.invalid/db' }],
    ['invalid bucket', { OCPNG_BACKUP_BUCKET: 'Bad Bucket Name' }],
    ['unsafe key reference', { OCPNG_BACKUP_KEY_REF: 'plaintext-secret-key-material' }],
  ])('rejects %s without echoing secret material', (_name, override) => {
    const source = { ...validEnvironment, ...override };
    const invoke = () => getBackupOperationsConfiguration(source);
    expect(invoke).toThrow('Backup operations server configuration is unavailable.');
    try {
      invoke();
    } catch (error) {
      for (const value of Object.values(source)) {
        if (value) expect(String(error)).not.toContain(value);
      }
    }
  });
});

describe('WASDOK-55 backup input validation', () => {
  it('normalizes a 3-500 character administrative reason', () => {
    expect(validateBackupReason('  Create verified archive  ')).toBe('Create verified archive');
  });

  it.each(['', 'x', '  '])('rejects a too-short reason', (reason) => {
    expect(() => validateBackupReason(reason)).toThrow(/3 to 500/i);
  });

  it('rejects a reason longer than 500 characters', () => {
    expect(() => validateBackupReason('x'.repeat(501))).toThrow(/3 to 500/i);
  });

  it('accepts an integer Unix recovery timestamp and rejects invalid values', () => {
    expect(validateRecoveryTimeUnix(1_788_000_000)).toBe(1_788_000_000);
    expect(() => validateRecoveryTimeUnix(-1)).toThrow(/recovery time/i);
    expect(() => validateRecoveryTimeUnix(Number.NaN)).toThrow(/recovery time/i);
  });
});

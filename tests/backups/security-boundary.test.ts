import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  ArchiveKeyProvider,
  ArchiveStore,
  DatabaseArchiveProvider,
  DatabaseRecoveryProvider,
  IdentityRecoveryProvider,
  ObjectArchiveProvider,
} from '@/lib/operations/backups/provider-types';

function filesUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) result.push(...filesUnder(path));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(path)) result.push(path);
  }
  return result;
}

describe('WASDOK-55 provider contracts', () => {
  it('defines the six approved infrastructure provider boundaries', () => {
    const contracts: [
      DatabaseRecoveryProvider?,
      DatabaseArchiveProvider?,
      IdentityRecoveryProvider?,
      ObjectArchiveProvider?,
      ArchiveStore?,
      ArchiveKeyProvider?,
    ] = [];
    expect(contracts).toHaveLength(0);
  });

  it('keeps provider configuration names out of browser-facing application/components code', () => {
    const forbidden = [
      'OCPNG_SUPABASE_MANAGEMENT_TOKEN',
      'OCPNG_BACKUP_DATABASE_URL',
      'OCPNG_BACKUP_KEY_REF',
      'SUPABASE_SERVICE_ROLE_KEY',
      'createServiceSupabaseClient',
    ];
    const browserFacing = [...filesUnder('app'), ...filesUnder('components')];
    for (const file of browserFacing) {
      const source = readFileSync(file, 'utf8');
      for (const token of forbidden) {
        expect(source, `${file} must not contain ${token}`).not.toContain(token);
      }
    }
  });

  it('never uses NEXT_PUBLIC prefixes for backup operations credentials', () => {
    const source = readFileSync('lib/config/server-environment.ts', 'utf8');
    expect(source).not.toMatch(/NEXT_PUBLIC_(?:OCPNG_)?(?:SUPABASE_MANAGEMENT|BACKUP_DATABASE|BACKUP_KEY|BACKUP_BUCKET)/);
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPECTED_SCHEMA_VERSION } from '@/lib/operations/health/providers/schema-drift';

const HOTFIX_MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260903002400_system_health_canonical_schema_version.sql',
);

describe('WASDOK-85 canonical schema-version hotfix', () => {
  it('advances the canonical application schema version to the hotfix migration', () => {
    expect(EXPECTED_SCHEMA_VERSION).toBe('20260903002400');
  });

  it('decouples canonical application schema version from Supabase migration ledger timestamps', () => {
    expect(existsSync(HOTFIX_MIGRATION_PATH)).toBe(true);
    if (!existsSync(HOTFIX_MIGRATION_PATH)) return;

    const migration = readFileSync(HOTFIX_MIGRATION_PATH, 'utf8');
    expect(migration).toContain('private.application_schema_state');
    expect(migration).toContain("'20260903002400'");
    expect(migration).toMatch(/create or replace function public\.read_applied_schema_version\(\)[\s\S]*private\.application_schema_state/i);
    expect(migration).not.toMatch(/supabase_migrations\.schema_migrations/i);
    expect(migration).toMatch(/revoke all on function public\.read_applied_schema_version\(\)[\s\S]*from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.read_applied_schema_version\(\)[\s\S]*to service_role/i);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260901000600_fix_has_scope_parameter_shadowing.sql',
);

function readMigration() {
  return readFileSync(migrationPath, 'utf8');
}

function extractFunctionBody(sql: string) {
  const match = sql.match(/as\s+\$\$(.*?)\$\$;/is);
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('WASDOK-27 has_scope SQL regression', () => {
  it('keeps the existing signature and compares the stored scope to positional argument $1', () => {
    const sql = readMigration();
    const body = extractFunctionBody(sql);

    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.has_scope\s*\(scope_code\s+text\)/i,
    );
    expect(body).toMatch(/ds\.scope_code\s*=\s*\$1\b/i);
    expect(body).toMatch(/ds\.scope_code\s*=\s*'\*'/i);
    expect(body).toMatch(/\$1\s+is\s+null/i);
  });

  it('does not reintroduce the ambiguous ds.scope_code = scope_code comparison in executable SQL', () => {
    const body = extractFunctionBody(readMigration());
    expect(body).not.toMatch(/ds\.scope_code\s*=\s*scope_code\b/i);
  });

  it('preserves the security-definer and empty-search-path hardening', () => {
    const sql = readMigration();
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/set\s+search_path\s*=\s*''/i);
  });
});

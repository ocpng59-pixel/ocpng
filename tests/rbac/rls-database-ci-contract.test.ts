import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const packageJsonPath = resolve(root, 'package.json');
const workflowPath = resolve(root, '.github/workflows/ci.yml');
const rlsSuitePath = resolve(root, 'supabase/tests/rls_authorization_regression.sql');

describe('WASDOK-27 automated RLS regression CI contract', () => {
  it('exposes a dedicated database RLS test script', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.['test:rls']).toBe('supabase test db');
  });

  it('runs the Supabase database regression suite in CI', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toMatch(/supabase\/setup-cli@v1/i);
    expect(workflow).toMatch(/supabase\s+start/i);
    expect(workflow).toMatch(/npm\s+run\s+test:rls/i);
  });

  it('contains executable pgTAP coverage for every manually verified representative scenario', () => {
    expect(existsSync(rlsSuitePath)).toBe(true);

    const sql = readFileSync(rlsSuitePath, 'utf8');
    for (const marker of [
      'has_scope exact-match regression',
      'Leadership RLS isolation',
      'Legal RLS isolation',
      'Intelligence RLS isolation',
      'Annual Statements RLS isolation',
      'Investigator assignment and scope isolation',
      'System Administrator protected-compartment no-bypass',
    ]) {
      expect(sql).toContain(marker);
    }

    expect(sql).toMatch(/select\s+plan\s*\(/i);
    expect(sql).toMatch(/select\s+\*\s+from\s+finish\s*\(\s*\)/i);
    expect(sql).toMatch(/rollback\s*;/i);
  });
});

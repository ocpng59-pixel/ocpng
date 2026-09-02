import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20260902001400_access_control_direct_write_boundary.sql';
const invitationPath = 'lib/access-control/invitations.ts';
const deploymentRunbookPath = 'docs/deployment/WASDOK-78-HOSTED-DEPLOYMENT.md';

function functionDefinition(source: string, functionName: string): string {
  const marker = `create or replace function ${functionName}(`;
  const start = source.toLowerCase().indexOf(marker.toLowerCase());
  if (start < 0) return '';
  const end = source.indexOf('\n$$;', start);
  return end < 0 ? source.slice(start) : source.slice(start, end + 4);
}

describe('WASDOK-78 Task 10 security regression contract', () => {
  it('serializes every operation that can remove an effective administrator path', () => {
    const source = readFileSync(migrationPath, 'utf8');
    expect(source).toMatch(/create or replace function private\.lock_access_admin_invariant\(\)/i);

    for (const rpc of [
      'public.admin_set_role_active',
      'public.admin_revoke_role_permission',
      'public.admin_revoke_user_role',
      'public.admin_set_user_active',
    ]) {
      const definition = functionDefinition(source, rpc);
      expect(definition, `${rpc} must be redefined in Task 10 hardening`).not.toBe('');
      expect(definition).toMatch(/perform private\.lock_access_admin_invariant\(\)/i);
    }
  });

  it('enforces the role-code contract inside the PostgreSQL authorization boundary', () => {
    const source = readFileSync(migrationPath, 'utf8');
    expect(source).toMatch(/create or replace function private\.require_valid_role_code\(/i);

    for (const rpc of ['public.admin_create_role', 'public.admin_update_role']) {
      const definition = functionDefinition(source, rpc);
      expect(definition, `${rpc} must be hardened at the database boundary`).not.toBe('');
      expect(definition).toMatch(/private\.require_valid_role_code\(/i);
    }
  });

  it('requires immutable audit evidence after a successful Supabase Auth invitation', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const adapter = readFileSync(invitationPath, 'utf8');

    expect(migration).toMatch(/create or replace function public\.admin_record_user_invitation\(/i);
    expect(adapter).toContain("session.rpc('admin_record_user_invitation'");
    expect(adapter).toContain('p_user_id: invitedUserId');
    expect(adapter).toContain('p_reason: reason');
    expect(adapter).toContain('deleteUser(invitedUserId)');
  });

  it('publishes one authoritative hosted deployment sequence for all four WASDOK-78 migrations', () => {
    expect(existsSync(deploymentRunbookPath)).toBe(true);
    const runbook = readFileSync(deploymentRunbookPath, 'utf8');
    const migrations = [
      '20260902001100_access_control_administration.sql',
      '20260902001200_access_control_role_permissions.sql',
      '20260902001300_access_control_user_access.sql',
      '20260902001400_access_control_direct_write_boundary.sql',
    ];

    const positions = migrations.map((migration) => runbook.indexOf(migration));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(runbook).toMatch(/01100\s*→\s*01200\s*→\s*01300\s*→\s*01400/);
    expect(runbook).toMatch(/supersedes.*Task 10.*Step 4/i);
  });
});

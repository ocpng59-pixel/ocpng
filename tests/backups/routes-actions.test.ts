import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const required = [
  'app/dashboard/operations/backups/page.tsx',
  'app/dashboard/operations/backups/[backupId]/page.tsx',
  'app/dashboard/operations/backups/restore/page.tsx',
  'app/dashboard/operations/backups/actions.ts',
  'components/operations/backups/backup-request-form.tsx',
  'components/operations/backups/backup-status-card.tsx',
  'components/operations/backups/backup-history-table.tsx',
  'components/operations/backups/backup-schedule-form.tsx',
  'components/operations/backups/retention-policy-form.tsx',
  'components/operations/backups/restore-request-form.tsx',
  'components/operations/backups/restore-authorization-panel.tsx',
];

describe('WASDOK-55 Backup & Recovery administration routes', () => {
  it('provides every approved route, action and component surface', () => {
    for (const path of required) expect(existsSync(path), `missing ${path}`).toBe(true);
  });

  it('adds Backup & Recovery to Administration and requires backup.view', () => {
    const navigation = readFileSync('lib/rbac/navigation.ts', 'utf8');
    expect(navigation).toContain("title: 'Backup & Recovery'");
    expect(navigation).toContain("href: '/dashboard/operations/backups'");
    expect(navigation).toContain("permissions: ['backup.view']");
  });

  it('requires server-side permission checks on all three route pages', () => {
    for (const path of [
      'app/dashboard/operations/backups/page.tsx',
      'app/dashboard/operations/backups/[backupId]/page.tsx',
      'app/dashboard/operations/backups/restore/page.tsx',
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('createServerSupabaseClient');
      expect(source).toContain('has_permission');
      expect(source).toContain('notFound()');
      expect(source).not.toContain('createServiceSupabaseClient');
    }
  });

  it('keeps provider credentials and service-role clients out of browser components', () => {
    for (const path of required.filter((path) => path.startsWith('components/'))) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|OCPNG_SUPABASE_MANAGEMENT_TOKEN|OCPNG_BACKUP_DATABASE_URL|createServiceSupabaseClient/);
    }
  });

  it('separates restore test, production restore and independent authorization actions', () => {
    const actions = readFileSync('app/dashboard/operations/backups/actions.ts', 'utf8');
    expect(actions).toContain('requestRestoreTestAction');
    expect(actions).toContain('requestProductionRestoreAction');
    expect(actions).toContain('authorizeProductionRestoreAction');
    expect(actions).toContain('requestDownloadAction');
  });
});

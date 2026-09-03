import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pages = [
  'app/dashboard/operations/system-health/page.tsx',
  'app/dashboard/operations/system-health/database/page.tsx',
  'app/dashboard/operations/system-health/storage/page.tsx',
  'app/dashboard/operations/system-health/backups/page.tsx',
  'app/dashboard/operations/system-health/deployment/page.tsx',
  'app/dashboard/operations/system-health/alerts/page.tsx',
];

const components = [
  'components/operations/health/health-status-card.tsx',
  'components/operations/health/metric-table.tsx',
  'components/operations/health/growth-chart.tsx',
  'components/operations/health/capacity-forecast-card.tsx',
  'components/operations/health/threshold-form.tsx',
  'components/operations/health/alert-table.tsx',
];

const required = [
  ...pages,
  ...components,
  'app/dashboard/operations/system-health/actions.ts',
  'lib/operations/health/queries.ts',
  'lib/operations/health/mutations.ts',
];

describe('WASDOK-85 System Health dashboard routes and actions', () => {
  it('provides every approved dashboard, action and component surface', () => {
    for (const path of required) expect(existsSync(path), `missing ${path}`).toBe(true);
  });

  it('adds System Health to Administration and requires system.health.view', () => {
    const navigation = readFileSync('lib/rbac/navigation.ts', 'utf8');
    expect(navigation).toContain("title: 'System Health'");
    expect(navigation).toContain("href: '/dashboard/operations/system-health'");
    expect(navigation).toContain("permissions: ['system.health.view']");
  });

  it('requires the authoritative server-side view permission on every page', () => {
    for (const path of pages) {
      expect(existsSync(path), `missing ${path}`).toBe(true);
      if (!existsSync(path)) continue;
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('createServerSupabaseClient');
      expect(source).toContain('has_permission');
      expect(source).toContain("'system.health.view'");
      expect(source).toContain('notFound()');
      expect(source).not.toContain('createServiceSupabaseClient');
    }
  });

  it('keeps threshold and alert administration behind system.health.manage RPCs', () => {
    expect(existsSync('lib/operations/health/mutations.ts')).toBe(true);
    if (!existsSync('lib/operations/health/mutations.ts')) return;
    const mutations = readFileSync('lib/operations/health/mutations.ts', 'utf8');
    expect(mutations).toContain('admin_set_health_threshold');
    expect(mutations).toContain('admin_set_health_threshold_active');
    expect(mutations).toContain('acknowledge_health_alert');
    expect(mutations).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('reads normalized metrics and permission-gated history only through health RPCs', () => {
    expect(existsSync('lib/operations/health/queries.ts')).toBe(true);
    if (!existsSync('lib/operations/health/queries.ts')) return;
    const queries = readFileSync('lib/operations/health/queries.ts', 'utf8');
    expect(queries).toContain('read_system_health_latest_metrics');
    expect(queries).toContain('read_system_health_metric_history');
    expect(queries).toContain('read_system_health_thresholds');
    expect(queries).toContain('read_system_health_alerts');
    expect(queries).toContain('read_deployment_health_state');
    expect(queries).not.toMatch(/system_health_metric_samples['"]\)|createServiceSupabaseClient|raw_payload|safe_metadata/);
  });

  it('renders UNKNOWN distinctly and exposes only approved drill-down fields', () => {
    expect(existsSync('components/operations/health/health-status-card.tsx')).toBe(true);
    expect(existsSync('components/operations/health/metric-table.tsx')).toBe(true);
    if (!existsSync('components/operations/health/health-status-card.tsx') || !existsSync('components/operations/health/metric-table.tsx')) return;
    const card = readFileSync('components/operations/health/health-status-card.tsx', 'utf8');
    const table = readFileSync('components/operations/health/metric-table.tsx', 'utf8');
    expect(card).toContain('UNKNOWN');
    expect(card).toContain('HEALTHY');
    for (const field of ['numericValue', 'unit', 'observedAt', 'source', 'reason']) expect(table).toContain(field);
    expect(table).not.toMatch(/filename|object_name|object_path|safeMetadata|raw/i);
  });

  it('keeps provider credentials and collector internals out of browser components', () => {
    for (const path of components) {
      expect(existsSync(path), `missing ${path}`).toBe(true);
      if (!existsSync(path)) continue;
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(/OCPNG_SUPABASE_HEALTH_TOKEN|SUPABASE_SERVICE_ROLE_KEY|Management API|raw_payload|prometheus/i);
    }
  });

  it('provides an accessible non-chart representation for growth history', () => {
    expect(existsSync('components/operations/health/growth-chart.tsx')).toBe(true);
    if (!existsSync('components/operations/health/growth-chart.tsx')) return;
    const source = readFileSync('components/operations/health/growth-chart.tsx', 'utf8');
    expect(source).toContain('<table');
    expect(source).toContain('observedAt');
    expect(source).toContain('value');
  });
});

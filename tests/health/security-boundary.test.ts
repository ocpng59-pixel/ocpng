import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/health/route';

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('WASDOK-85 public liveness boundary', () => {
  it('returns only the public-safe liveness payload', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('does not disclose release, environment, schema, provider or infrastructure details', async () => {
    const response = await GET();
    const body = JSON.stringify(await response.json());
    for (const prohibited of [
      'commit',
      'release',
      'schema',
      'migration',
      'supabase',
      'database',
      'storage',
      'region',
      'environment',
      'version',
    ]) {
      expect(body.toLowerCase()).not.toContain(prohibited);
    }
  });
});

describe('WASDOK-85 browser credential boundary', () => {
  it('keeps health provider credentials out of browser-facing source', () => {
    const browserFacingFiles = [
      'app/layout.tsx',
      'app/page.tsx',
      'app/dashboard/layout.tsx',
      'lib/rbac/navigation.ts',
    ];
    const prohibited = [
      'OCPNG_SUPABASE_HEALTH_TOKEN',
      'OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE',
      'SUPABASE_SERVICE_ROLE_KEY',
      'analytics/endpoints/metrics',
      'api.supabase.com/v1/projects',
    ];

    for (const relativePath of browserFacingFiles) {
      const content = read(relativePath);
      for (const secretMarker of prohibited) expect(content).not.toContain(secretMarker);
    }
  });

  it('does not use NEXT_PUBLIC variables for health provider credentials', () => {
    const serverEnvironment = read('lib/config/server-environment.ts');
    expect(serverEnvironment).not.toContain('NEXT_PUBLIC_OCPNG_SUPABASE_HEALTH_TOKEN');
    expect(serverEnvironment).not.toContain('NEXT_PUBLIC_OCPNG_SUPABASE_PROJECT_REF');
    expect(serverEnvironment).not.toContain('NEXT_PUBLIC_OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE');
  });
});

describe('WASDOK-85 production runtime security boundary', () => {
  it('keeps health persistence RPC-only and excludes raw migration/backup artifact access', () => {
    const supabaseRuntime = read('scripts/operations/lib/health-supabase-runtime.mjs');
    const productionRuntime = read('scripts/operations/runtime/health-production-runtime.mjs');
    const combinedRuntime = `${supabaseRuntime}\n${productionRuntime}`;

    expect(combinedRuntime).not.toMatch(/\.from\(['"]system_health_/);
    expect(combinedRuntime).not.toContain('supabase_migrations.schema_migrations');

    const rpcNames = Array.from(
      supabaseRuntime.matchAll(/\.rpc\(['"]([^'"]+)['"]/g),
      (match) => match[1],
    ).sort();
    expect(rpcNames).toEqual([
      'read_applied_schema_version',
      'record_deployment_health_state',
      'record_health_snapshot',
    ]);

    for (const forbidden of [
      'backup_artifacts',
      'storage_reference',
      'archive_checksum',
      'encryption_key_reference',
      'provider_recovery_ref',
      'impact_summary',
      'safe_metadata',
    ]) {
      expect(supabaseRuntime).not.toContain(forbidden);
    }
  });

  it('documents only blank server-side production runtime placeholders', () => {
    const envExample = read('.env.example');
    for (const variable of [
      'OCPNG_SUPABASE_PROJECT_REF',
      'OCPNG_SUPABASE_HEALTH_TOKEN',
      'OCPNG_PUBLIC_APP_URL',
      'OCPNG_DEPLOYED_COMMIT',
      'OCPNG_RELEASE_ID',
      'OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE',
    ]) {
      expect(envExample).toMatch(new RegExp(`^${variable}=$`, 'm'));
      expect(envExample).not.toContain(`NEXT_PUBLIC_${variable}`);
    }
  });

  it('pins the reviewed runtime adapter in static security and deployment guidance', () => {
    const staticSecurity = read('scripts/static-security.mjs');
    const runbook = read('docs/deployment/WASDOK-85-SYSTEM-HEALTH-DEPLOYMENT.md');

    for (const marker of [
      'OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE',
      'read_applied_schema_version',
      'record_health_snapshot',
      'record_deployment_health_state',
      'supabase_migrations.schema_migrations',
      'backup_artifacts',
    ]) {
      expect(staticSecurity).toContain(marker);
    }

    expect(runbook).toContain('scripts/operations/runtime/health-production-runtime.mjs');
    expect(runbook).toContain('OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE');
    expect(runbook).toContain('without executing the collector');
    expect(runbook).toContain('separate enablement gate');
  });
});

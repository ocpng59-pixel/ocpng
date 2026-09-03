import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/health/route';

const root = process.cwd();

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
      'analytics/endpoints/metrics',
      'api.supabase.com/v1/projects',
    ];

    for (const relativePath of browserFacingFiles) {
      const content = readFileSync(join(root, relativePath), 'utf8');
      for (const secretMarker of prohibited) expect(content).not.toContain(secretMarker);
    }
  });

  it('does not use NEXT_PUBLIC variables for health provider credentials', () => {
    const serverEnvironment = readFileSync(join(root, 'lib/config/server-environment.ts'), 'utf8');
    expect(serverEnvironment).not.toContain('NEXT_PUBLIC_OCPNG_SUPABASE_HEALTH_TOKEN');
    expect(serverEnvironment).not.toContain('NEXT_PUBLIC_OCPNG_SUPABASE_PROJECT_REF');
  });
});

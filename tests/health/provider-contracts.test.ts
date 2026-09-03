import { describe, expect, it, vi } from 'vitest';
import { getHealthOperationsConfiguration } from '@/lib/config/server-environment';
import { SupabaseMetricsProvider } from '@/lib/operations/health/providers/supabase-metrics';

const projectRef = 'abcdefghijklmnopqrst';
const healthToken = 'sbp_DEMO_HEALTH_TOKEN_1234567890';

const validEnvironment = {
  OCPNG_SUPABASE_PROJECT_REF: projectRef,
  OCPNG_SUPABASE_HEALTH_TOKEN: healthToken,
  OCPNG_PUBLIC_APP_URL: 'https://wasdok-demo.example.invalid',
};

describe('WASDOK-85 server-only health configuration', () => {
  it('accepts a complete health operations configuration', () => {
    expect(getHealthOperationsConfiguration(validEnvironment)).toEqual({
      projectRef,
      healthToken,
      publicAppUrl: 'https://wasdok-demo.example.invalid',
    });
  });

  it.each([
    'OCPNG_SUPABASE_PROJECT_REF',
    'OCPNG_SUPABASE_HEALTH_TOKEN',
    'OCPNG_PUBLIC_APP_URL',
  ] as const)('fails closed when %s is missing', (key) => {
    expect(() => getHealthOperationsConfiguration({ ...validEnvironment, [key]: undefined })).toThrow(
      'System health server configuration is unavailable.',
    );
  });

  it('rejects invalid configuration without echoing token or URL material', () => {
    const source = {
      ...validEnvironment,
      OCPNG_SUPABASE_HEALTH_TOKEN: 'DEMO PRIVATE TOKEN WITH SPACES',
      OCPNG_PUBLIC_APP_URL: 'javascript:alert(1)',
    };
    try {
      getHealthOperationsConfiguration(source);
      throw new Error('expected health configuration rejection');
    } catch (error) {
      expect(String(error)).toContain('System health server configuration is unavailable.');
      expect(String(error)).not.toContain(source.OCPNG_SUPABASE_HEALTH_TOKEN);
      expect(String(error)).not.toContain(source.OCPNG_PUBLIC_APP_URL);
    }
  });
});

describe('WASDOK-85 Supabase Management API metrics provider', () => {
  it('scrapes the current Management API metrics endpoint with a bearer token', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe(
        `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/metrics`,
      );
      expect(init?.method ?? 'GET').toBe('GET');
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${healthToken}`);
      expect(new Headers(init?.headers).get('accept')).toContain('text/plain');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(
        [
          '# HELP pg_database_size_mb Disk space used by the database',
          'pg_database_size_mb{supabase_project_ref="abcdefghijklmnopqrst",service_type="postgresql",server="localhost:5432"} 12.5',
          'pg_stat_database_num_backends{supabase_project_ref="abcdefghijklmnopqrst",service_type="postgresql",server="localhost:5432"} 7',
          'unexpected_sensitive_metric{object_name="RESTRICTED-case-file.pdf",bucket="evidence"} 999',
        ].join('\n'),
        { status: 200, headers: { 'content-type': 'text/plain; version=0.0.4' } },
      );
    });

    const provider = new SupabaseMetricsProvider({ projectRef, healthToken, fetchImpl });
    const result = await provider.collect();

    expect(result).toEqual({
      source: 'supabase-management-metrics',
      status: 'AVAILABLE',
      metrics: [
        { code: 'db.database_bytes', value: 12.5 * 1024 * 1024 },
        { code: 'db.connections_active', value: 7 },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('RESTRICTED-case-file.pdf');
    expect(JSON.stringify(result)).not.toContain('bucket');
    expect(JSON.stringify(result)).not.toContain('server');
  });

  it('drops malformed, non-finite and unallowlisted Prometheus series', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(
        [
          'unknown_metric 99',
          'pg_database_size_mb NaN',
          'pg_stat_database_num_backends +Inf',
          'malformed metric text',
        ].join('\n'),
        { status: 200 },
      ),
    );
    const provider = new SupabaseMetricsProvider({ projectRef, healthToken, fetchImpl });
    await expect(provider.collect()).resolves.toEqual({
      source: 'supabase-management-metrics',
      status: 'AVAILABLE',
      metrics: [],
    });
  });

  it.each([401, 403, 429, 500, 503])(
    'maps provider HTTP %s to UNKNOWN without leaking provider body or health token',
    async (status) => {
      const secretBody = `provider failure ${healthToken} bearer-secret`;
      const fetchImpl = vi.fn<typeof fetch>(async () => new Response(secretBody, { status }));
      const provider = new SupabaseMetricsProvider({ projectRef, healthToken, fetchImpl });
      const result = await provider.collect();
      expect(result.status).toBe('UNKNOWN');
      expect(result.metrics).toEqual([]);
      expect(JSON.stringify(result)).not.toContain(healthToken);
      expect(JSON.stringify(result)).not.toContain(secretBody);
      expect(JSON.stringify(result)).not.toContain('bearer-secret');
    },
  );

  it('maps thrown network errors to UNKNOWN without propagating exception text', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error(`socket failed with ${healthToken}`);
    });
    const provider = new SupabaseMetricsProvider({ projectRef, healthToken, fetchImpl });
    const result = await provider.collect();
    expect(result).toEqual({
      source: 'supabase-management-metrics',
      status: 'UNKNOWN',
      metrics: [],
      reason: 'PROVIDER_UNAVAILABLE',
    });
  });
});

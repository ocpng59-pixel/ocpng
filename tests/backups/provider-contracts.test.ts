import { describe, expect, it, vi } from 'vitest';
import {
  BackupProviderOperationalError,
  SupabaseManagementRecoveryProvider,
} from '@/lib/operations/backups/providers/supabase-management';

const projectRef = 'abcdefghijklmnopqrst';
const managementToken = 'sbp_DEMO_ONLY_NOT_REAL_1234567890';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createProvider(input?: {
  fetchImpl?: typeof fetch;
  isRestoreRunAuthorized?: (restoreRunId: string) => Promise<boolean>;
  timeoutMs?: number;
}) {
  return new SupabaseManagementRecoveryProvider({
    projectRef,
    managementToken,
    fetchImpl: input?.fetchImpl,
    isRestoreRunAuthorized: input?.isRestoreRunAuthorized,
    timeoutMs: input?.timeoutMs,
  });
}

describe('WASDOK-55 Supabase Management API recovery provider', () => {
  it('maps backup status and physical PITR bounds into provider-neutral recovery status', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe(`https://api.supabase.com/v1/projects/${projectRef}/database/backups`);
      expect(init?.method ?? 'GET').toBe('GET');
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${managementToken}`);
      expect(init?.signal).toBeInstanceOf(AbortSignal);

      return jsonResponse({
        region: 'ap-southeast-1',
        walg_enabled: true,
        pitr_enabled: true,
        backups: [
          {
            id: 101,
            is_physical_backup: true,
            status: 'COMPLETED',
            inserted_at: '2026-09-03T00:00:00.000Z',
          },
          {
            id: 102,
            is_physical_backup: true,
            status: 'PENDING',
            inserted_at: '2026-09-03T01:00:00.000Z',
          },
        ],
        physical_backup_data: {
          earliest_physical_backup_date_unix: 1788393600,
          latest_physical_backup_date_unix: 1788397200,
        },
      });
    });

    const result = await createProvider({ fetchImpl }).listRecoveryPoints();

    expect(result).toEqual({
      enabled: true,
      earliestRecoveryTime: '2026-09-03T00:00:00.000Z',
      latestRecoveryTime: '2026-09-03T01:00:00.000Z',
      points: [
        {
          reference: '101',
          kind: 'PHYSICAL',
          recoveryTime: '2026-09-03T00:00:00.000Z',
          earliestRecoveryTime: '2026-09-03T00:00:00.000Z',
          latestRecoveryTime: '2026-09-03T01:00:00.000Z',
          available: true,
        },
        {
          reference: '102',
          kind: 'PHYSICAL',
          recoveryTime: '2026-09-03T01:00:00.000Z',
          earliestRecoveryTime: '2026-09-03T00:00:00.000Z',
          latestRecoveryTime: '2026-09-03T01:00:00.000Z',
          available: false,
        },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never calls restore-pitr when the restore run is not independently authorized', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = createProvider({
      fetchImpl,
      isRestoreRunAuthorized: async () => false,
    });

    await expect(provider.restorePitr({
      restoreRunId: '55000000-0000-0000-0000-000000000301',
      recoveryTimeUnix: 1788393600,
    })).rejects.toMatchObject({ code: 'RESTORE_NOT_AUTHORIZED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'never calls restore-pitr for invalid Unix recovery time %s',
    async (recoveryTimeUnix) => {
      const fetchImpl = vi.fn<typeof fetch>();
      const provider = createProvider({
        fetchImpl,
        isRestoreRunAuthorized: async () => true,
      });

      await expect(provider.restorePitr({
        restoreRunId: '55000000-0000-0000-0000-000000000301',
        recoveryTimeUnix,
      })).rejects.toMatchObject({ code: 'INVALID_RECOVERY_TIME' });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('posts only the authorized Unix recovery target to the Supabase restore endpoint', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe(`https://api.supabase.com/v1/projects/${projectRef}/database/backups/restore-pitr`);
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${managementToken}`);
      expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(String(init?.body))).toEqual({ recovery_time_target_unix: 1788393600 });
      expect(String(init?.body)).not.toContain('55000000-0000-0000-0000-000000000301');
      return jsonResponse({}, 201);
    });

    const provider = createProvider({
      fetchImpl,
      isRestoreRunAuthorized: async (restoreRunId) =>
        restoreRunId === '55000000-0000-0000-0000-000000000301',
    });

    await expect(provider.restorePitr({
      restoreRunId: '55000000-0000-0000-0000-000000000301',
      recoveryTimeUnix: 1788393600,
    })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, 'MANAGEMENT_AUTHENTICATION_FAILED'],
    [403, 'MANAGEMENT_AUTHORIZATION_FAILED'],
    [429, 'MANAGEMENT_RATE_LIMITED'],
    [500, 'MANAGEMENT_UNAVAILABLE'],
    [503, 'MANAGEMENT_UNAVAILABLE'],
  ])('maps HTTP %s to a safe operational error without leaking response or token material', async (status, code) => {
    const providerSecretBody = `provider-error ${managementToken} bearer-secret`;
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(providerSecretBody, { status }),
    );
    const provider = createProvider({ fetchImpl });

    let thrown: unknown;
    try {
      await provider.listRecoveryPoints();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BackupProviderOperationalError);
    expect(thrown).toMatchObject({ code });
    expect(String(thrown)).not.toContain(managementToken);
    expect(String(thrown)).not.toContain(providerSecretBody);
    expect(String(thrown)).not.toContain('bearer-secret');
  });

  it('fails closed before POST when no restore authorization verifier is configured', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = createProvider({ fetchImpl });

    await expect(provider.restorePitr({
      restoreRunId: '55000000-0000-0000-0000-000000000301',
      recoveryTimeUnix: 1788393600,
    })).rejects.toMatchObject({ code: 'RESTORE_NOT_AUTHORIZED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

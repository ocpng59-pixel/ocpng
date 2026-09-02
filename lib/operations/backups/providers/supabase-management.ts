import type { DatabaseRecoveryProvider } from '../provider-types';
import type { ProviderRecoveryPoint, ProviderRecoveryStatus } from '../types';

const MANAGEMENT_API_BASE_URL = 'https://api.supabase.com';
const DEFAULT_TIMEOUT_MS = 15_000;

export type BackupProviderErrorCode =
  | 'INVALID_RECOVERY_TIME'
  | 'RESTORE_NOT_AUTHORIZED'
  | 'MANAGEMENT_AUTHENTICATION_FAILED'
  | 'MANAGEMENT_AUTHORIZATION_FAILED'
  | 'MANAGEMENT_RATE_LIMITED'
  | 'MANAGEMENT_UNAVAILABLE'
  | 'MANAGEMENT_REQUEST_FAILED'
  | 'MANAGEMENT_RESPONSE_INVALID';

export class BackupProviderOperationalError extends Error {
  readonly code: BackupProviderErrorCode;

  constructor(code: BackupProviderErrorCode, message: string) {
    super(message);
    this.name = 'BackupProviderOperationalError';
    this.code = code;
  }
}

type RestoreAuthorizationVerifier = (restoreRunId: string) => Promise<boolean>;

type SupabaseManagementRecoveryProviderOptions = {
  projectRef: string;
  managementToken: string;
  fetchImpl?: typeof fetch;
  isRestoreRunAuthorized?: RestoreAuthorizationVerifier;
  timeoutMs?: number;
};

type SupabaseBackupRecord = {
  id?: string | number;
  is_physical_backup?: boolean;
  status?: string;
  inserted_at?: string;
};

type SupabaseBackupListResponse = {
  pitr_enabled?: boolean;
  backups?: SupabaseBackupRecord[];
  physical_backup_data?: {
    earliest_physical_backup_date_unix?: number;
    latest_physical_backup_date_unix?: number;
  } | null;
};

function safeIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return null;
  const timestamp = value * 1000;
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function mapHttpError(status: number): BackupProviderOperationalError {
  if (status === 401) {
    return new BackupProviderOperationalError(
      'MANAGEMENT_AUTHENTICATION_FAILED',
      'Backup provider authentication failed.',
    );
  }
  if (status === 403) {
    return new BackupProviderOperationalError(
      'MANAGEMENT_AUTHORIZATION_FAILED',
      'Backup provider authorization failed.',
    );
  }
  if (status === 429) {
    return new BackupProviderOperationalError(
      'MANAGEMENT_RATE_LIMITED',
      'Backup provider rate limit was reached.',
    );
  }
  if (status >= 500) {
    return new BackupProviderOperationalError(
      'MANAGEMENT_UNAVAILABLE',
      'Backup provider is temporarily unavailable.',
    );
  }
  return new BackupProviderOperationalError(
    'MANAGEMENT_REQUEST_FAILED',
    'Backup provider request failed.',
  );
}

export class SupabaseManagementRecoveryProvider implements DatabaseRecoveryProvider {
  private readonly projectRef: string;
  private readonly managementToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly isRestoreRunAuthorized?: RestoreAuthorizationVerifier;
  private readonly timeoutMs: number;

  constructor(options: SupabaseManagementRecoveryProviderOptions) {
    this.projectRef = options.projectRef;
    this.managementToken = options.managementToken;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.isRestoreRunAuthorized = options.isRestoreRunAuthorized;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${this.managementToken}`);
    headers.set('accept', 'application/json');

    try {
      const response = await this.fetchImpl(`${MANAGEMENT_API_BASE_URL}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) throw mapHttpError(response.status);
      return response;
    } catch (error) {
      if (error instanceof BackupProviderOperationalError) throw error;
      throw new BackupProviderOperationalError(
        'MANAGEMENT_UNAVAILABLE',
        'Backup provider is temporarily unavailable.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async listRecoveryPoints(): Promise<ProviderRecoveryStatus> {
    const response = await this.request(
      `/v1/projects/${encodeURIComponent(this.projectRef)}/database/backups`,
      { method: 'GET' },
    );

    let payload: SupabaseBackupListResponse;
    try {
      payload = (await response.json()) as SupabaseBackupListResponse;
    } catch {
      throw new BackupProviderOperationalError(
        'MANAGEMENT_RESPONSE_INVALID',
        'Backup provider returned an invalid response.',
      );
    }

    const earliestRecoveryTime = unixSecondsToIso(
      payload.physical_backup_data?.earliest_physical_backup_date_unix,
    );
    const latestRecoveryTime = unixSecondsToIso(
      payload.physical_backup_data?.latest_physical_backup_date_unix,
    );

    const points: ProviderRecoveryPoint[] = Array.isArray(payload.backups)
      ? payload.backups.map((backup) => ({
          reference: String(backup.id ?? ''),
          kind: backup.is_physical_backup ? 'PHYSICAL' : 'LOGICAL',
          recoveryTime: safeIsoTimestamp(backup.inserted_at),
          earliestRecoveryTime,
          latestRecoveryTime,
          available: backup.status === 'COMPLETED',
        }))
      : [];

    return {
      enabled: payload.pitr_enabled === true,
      points,
      earliestRecoveryTime,
      latestRecoveryTime,
    };
  }

  async restorePitr(input: { recoveryTimeUnix: number; restoreRunId: string }): Promise<void> {
    if (
      !Number.isFinite(input.recoveryTimeUnix) ||
      !Number.isSafeInteger(input.recoveryTimeUnix) ||
      input.recoveryTimeUnix <= 0
    ) {
      throw new BackupProviderOperationalError(
        'INVALID_RECOVERY_TIME',
        'A valid Unix recovery time is required.',
      );
    }

    const authorized = this.isRestoreRunAuthorized
      ? await this.isRestoreRunAuthorized(input.restoreRunId)
      : false;

    if (!authorized) {
      throw new BackupProviderOperationalError(
        'RESTORE_NOT_AUTHORIZED',
        'Production restore authorization is required.',
      );
    }

    await this.request(
      `/v1/projects/${encodeURIComponent(this.projectRef)}/database/backups/restore-pitr`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recovery_time_target_unix: input.recoveryTimeUnix }),
      },
    );
  }
}

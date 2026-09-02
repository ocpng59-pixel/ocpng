export type BackupJobResult = {
  status: 'AVAILABLE';
  archiveRef: string | null;
};

export type BackupJobRunnerInput = {
  jobId: string;
  loadJob: (jobId: string) => Promise<{ status: string; [key: string]: unknown } | null>;
  transition: (jobId: string, from: string, to: string, metadata?: Record<string, unknown>) => Promise<unknown> | unknown;
  exportDatabase: (job: unknown) => Promise<{ byteSize?: number; [key: string]: unknown }>;
  verifyIdentity: (job: unknown) => Promise<{ covered?: boolean; [key: string]: unknown }>;
  exportStorage: (job: unknown) => Promise<{ byteSize?: number; objectCount?: number; [key: string]: unknown }>;
  packageArchive: (input: unknown) => Promise<{ filePath?: string; byteSize?: number; checksumSha256?: string; [key: string]: unknown }>;
  verifyArchive: (artifact: unknown) => Promise<boolean>;
  storeArchive: (artifact: unknown, job: unknown) => Promise<{ ref?: string; byteSize?: number; checksumSha256?: string; [key: string]: unknown }>;
  recordVerification: (jobId: string, status: string, metadata?: Record<string, unknown>) => Promise<unknown> | unknown;
  cleanup: (jobId: string) => Promise<unknown> | unknown;
  log?: (message: string) => void;
  workDir?: string;
};

export function runBackupJob(input: BackupJobRunnerInput): Promise<BackupJobResult>;

export type BackupSchedule = {
  id: string;
  enabled: boolean;
  nextRunAt: string | Date;
  backupType: string;
};

export function enqueueDueSchedules(input: {
  schedules: BackupSchedule[];
  now?: Date;
  enqueue: (input: {
    scheduleId: string;
    backupType: string;
    dueAt: string;
    idempotencyKey: string;
  }) => Promise<unknown> | unknown;
}): Promise<number>;

export type RetentionArtifact = {
  id: string;
  expiresAt?: string | Date | null;
  retentionPolicyId?: string | null;
  [key: string]: unknown;
};

export type RetentionPolicy = {
  id: string;
  enabled?: boolean;
  isActive?: boolean;
  is_active?: boolean;
  purgeEnabled?: boolean;
  purge_enabled?: boolean;
};

export function purgeExpiredArtifacts(input: {
  artifacts: RetentionArtifact[];
  policies: RetentionPolicy[];
  now?: Date;
  purge: (artifact: RetentionArtifact) => Promise<unknown> | unknown;
}): Promise<number>;

export type ProviderRecoveryPoint = {
  reference: string;
  kind: string;
  recoveryTime: string | null;
  earliestRecoveryTime: string | null;
  latestRecoveryTime: string | null;
  available: boolean;
};

export type ProviderRecoveryStatus = {
  enabled: boolean;
  points: ProviderRecoveryPoint[];
  earliestRecoveryTime: string | null;
  latestRecoveryTime: string | null;
};

export type DatabaseArchiveResult = {
  files: string[];
  byteSize: number;
  safeMetadata?: Record<string, unknown>;
};

export type IdentityRecoveryCoverage = {
  covered: boolean;
  method: string;
  safeMetadata?: Record<string, unknown>;
};

export type StorageCheckpoint = {
  observedAt: string;
  cursor?: string | null;
};

export type ObjectArchiveResult = {
  files: string[];
  objectCount: number;
  byteSize: number;
  checkpoint?: StorageCheckpoint;
  safeMetadata?: Record<string, unknown>;
};

export type ArchiveStorePutInput = {
  filePath: string;
  backupId: string;
  checksumSha256: string;
  keyRef: string;
  contentType?: string;
};

export type ArchiveStoredReference = {
  ref: string;
  byteSize: number;
  checksumSha256: string;
};

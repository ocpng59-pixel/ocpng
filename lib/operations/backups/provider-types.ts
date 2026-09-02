import type { Buffer } from 'node:buffer';
import type {
  ArchiveStoredReference,
  ArchiveStorePutInput,
  DatabaseArchiveResult,
  IdentityRecoveryCoverage,
  ObjectArchiveResult,
  ProviderRecoveryStatus,
  StorageCheckpoint,
} from './types';

export interface DatabaseRecoveryProvider {
  listRecoveryPoints(): Promise<ProviderRecoveryStatus>;
  restorePitr(input: { recoveryTimeUnix: number; restoreRunId: string }): Promise<void>;
}

export interface DatabaseArchiveProvider {
  createLogicalExport(workDir: string): Promise<DatabaseArchiveResult>;
}

export interface IdentityRecoveryProvider {
  verifyCoverage(): Promise<IdentityRecoveryCoverage>;
}

export interface ObjectArchiveProvider {
  exportFull(workDir: string): Promise<ObjectArchiveResult>;
  exportIncremental(workDir: string, checkpoint: StorageCheckpoint): Promise<ObjectArchiveResult>;
}

export interface ArchiveStore {
  putEncryptedArtifact(input: ArchiveStorePutInput): Promise<ArchiveStoredReference>;
  createDownloadGrant(ref: string, expiresInSeconds: number): Promise<string>;
}

export interface ArchiveKeyProvider {
  getEncryptionKey(keyRef: string): Promise<Buffer>;
}

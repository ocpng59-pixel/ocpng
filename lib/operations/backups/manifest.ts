export type RecoveryDomainName = 'application_database' | 'identity_auth' | 'storage_objects';
export type RecoveryDomainVerificationStatus = 'VERIFIED' | 'FAILED' | 'UNVERIFIED';

export type RecoveryDomainEvidence = {
  status: RecoveryDomainVerificationStatus;
  method: string;
  safeMetadata?: Record<string, unknown>;
};

export type RecoveryManifest = {
  version: 1;
  backupId: string;
  backupType: 'FULL' | 'INCREMENTAL';
  createdAt: string;
  domains: Partial<Record<RecoveryDomainName, RecoveryDomainEvidence>>;
  safeMetadata?: Record<string, unknown>;
};

const mandatoryFullDomains: RecoveryDomainName[] = [
  'application_database',
  'identity_auth',
  'storage_objects',
];

const unsafeMetadataKey = (key: string): boolean => {
  const normalized = key.trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (normalized === 'key' || normalized === 'secret') return true;
  if (normalized.includes('password')) return true;
  if (normalized.includes('token')) return true;
  if (normalized === 'service_role' || normalized.includes('service_role_key')) return true;
  if (normalized === 'database_url' || normalized.endsWith('_database_url')) return true;
  if (normalized === 'encryption_key' || normalized.endsWith('_encryption_key')) return true;
  if (normalized === 'private_key' || normalized.endsWith('_private_key')) return true;
  if (normalized.endsWith('_secret') || normalized.startsWith('secret_')) return true;
  return false;
};

function assertSafeValue(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertSafeValue(item);
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (unsafeMetadataKey(key)) {
      throw new Error('Unsafe manifest metadata is not permitted.');
    }
    assertSafeValue(nested);
  }
}

export function verifyRecoveryManifest(manifest: RecoveryManifest): void {
  assertSafeValue(manifest);

  if (manifest.backupType !== 'FULL') return;

  for (const domain of mandatoryFullDomains) {
    const evidence = manifest.domains[domain];
    if (!evidence) {
      throw new Error(`FULL recovery manifest requires ${domain}.`);
    }
    if (evidence.status !== 'VERIFIED') {
      throw new Error(`FULL recovery manifest domain ${domain} must be VERIFIED.`);
    }
  }
}

export function serializeRecoveryManifest(manifest: RecoveryManifest): string {
  verifyRecoveryManifest(manifest);
  return JSON.stringify(manifest, null, 2);
}

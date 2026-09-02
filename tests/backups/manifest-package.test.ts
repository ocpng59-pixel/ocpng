import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  serializeRecoveryManifest,
  verifyRecoveryManifest,
  type RecoveryManifest,
} from '@/lib/operations/backups/manifest';
import {
  SupabaseCliDatabaseArchiveProvider,
  type DatabaseDumpCommand,
} from '@/lib/operations/backups/providers/database-archive';
import { ProviderIdentityRecoveryProvider } from '@/lib/operations/backups/providers/identity-recovery';
import {
  SupabaseStorageArchiveProvider,
  type SupabaseStorageClientLike,
} from '@/lib/operations/backups/providers/storage-archive';
import type { DatabaseRecoveryProvider } from '@/lib/operations/backups/provider-types';

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const dir = await mkdtemp(join(tmpdir(), 'wasdok55-task6-'));
  temporaryDirectories.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function completeFullManifest(): RecoveryManifest {
  return {
    version: 1,
    backupId: '55000000-0000-0000-0000-000000000401',
    backupType: 'FULL',
    createdAt: '2026-09-03T02:00:00.000Z',
    domains: {
      application_database: {
        status: 'VERIFIED',
        method: 'SUPABASE_LOGICAL_EXPORT',
        safeMetadata: { fileCount: 5 },
      },
      identity_auth: {
        status: 'VERIFIED',
        method: 'VERIFIED_PROVIDER_RECOVERY',
        safeMetadata: { pitrEnabled: true },
      },
      storage_objects: {
        status: 'VERIFIED',
        method: 'SUPABASE_STORAGE_API_EXPORT',
        safeMetadata: { objectCount: 1 },
      },
    },
    safeMetadata: { wasdok: 'WASDOK-55' },
  };
}

describe('WASDOK-55 comprehensive recovery manifest', () => {
  it.each(['application_database', 'identity_auth', 'storage_objects'] as const)(
    'rejects FULL recovery when %s is absent',
    (domain) => {
      const manifest = completeFullManifest();
      delete manifest.domains[domain];
      expect(() => verifyRecoveryManifest(manifest)).toThrow(/full recovery manifest/i);
    },
  );

  it('rejects FULL recovery when a mandatory domain is not VERIFIED', () => {
    const manifest = completeFullManifest();
    manifest.domains.identity_auth = {
      status: 'FAILED',
      method: 'PROVIDER_RECOVERY_UNAVAILABLE',
    };
    expect(() => verifyRecoveryManifest(manifest)).toThrow(/identity_auth/i);
  });

  it('accepts FULL recovery only when database, identity and storage are all verified', () => {
    expect(() => verifyRecoveryManifest(completeFullManifest())).not.toThrow();
  });

  it.each(['password', 'access_token', 'refresh_token', 'service_role', 'database_url', 'encryption_key', 'private_key', 'secret'])(
    'refuses manifest serialization when nested metadata contains unsafe field %s',
    (unsafeField) => {
      const unsafeValue = 'DEMO-CREDENTIAL-MATERIAL-MUST-NOT-LEAK';
      const manifest = completeFullManifest();
      manifest.safeMetadata = { nested: { [unsafeField]: unsafeValue } };

      let thrown: unknown;
      try {
        serializeRecoveryManifest(manifest);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect(String(thrown)).toMatch(/unsafe manifest metadata/i);
      expect(String(thrown)).not.toContain(unsafeValue);
    },
  );

  it('allows safe key references without accepting encryption key material', () => {
    const manifest = completeFullManifest();
    manifest.safeMetadata = { keyReference: 'kms://ocpng/backup-key-v1' };
    const serialized = serializeRecoveryManifest(manifest);
    expect(JSON.parse(serialized).safeMetadata.keyReference).toBe('kms://ocpng/backup-key-v1');
  });
});

describe('WASDOK-55 logical database archive provider', () => {
  it('creates roles, schema, data and migration-history exports without putting the database URL in command arguments', async () => {
    const workDir = await temporaryDirectory();
    const databaseUrl = 'postgresql://postgres:DEMO-SECRET@db.example.invalid:5432/postgres';
    const commands: DatabaseDumpCommand[] = [];

    const provider = new SupabaseCliDatabaseArchiveProvider({
      databaseUrl,
      runCommand: async (command) => {
        commands.push(command);
        await writeFile(command.outputPath, `-- DEMO ${basename(command.outputPath)}\n`, 'utf8');
      },
    });

    const result = await provider.createLogicalExport(workDir);

    expect(result.files.map(basename).sort()).toEqual([
      'data.sql',
      'migration_history_data.sql',
      'migration_history_schema.sql',
      'roles.sql',
      'schema.sql',
    ]);
    expect(commands).toHaveLength(5);
    for (const command of commands) {
      expect(command.command).toBe('sh');
      expect(JSON.stringify(command.args)).not.toContain(databaseUrl);
      expect(command.env.OCPNG_BACKUP_DATABASE_URL).toBe(databaseUrl);
      expect(command.args.join(' ')).toContain('$OCPNG_BACKUP_DATABASE_URL');
      expect(command.args.join(' ')).not.toContain('DEMO-SECRET');
    }
    expect(JSON.stringify(result.safeMetadata)).not.toContain(databaseUrl);
    expect(JSON.stringify(result.safeMetadata)).not.toContain('DEMO-SECRET');
  });
});

describe('WASDOK-55 identity recovery coverage', () => {
  it('reports provider-native identity coverage only when PITR covers the selected recovery time', async () => {
    const recoveryProvider: DatabaseRecoveryProvider = {
      listRecoveryPoints: async () => ({
        enabled: true,
        earliestRecoveryTime: '2026-09-03T00:00:00.000Z',
        latestRecoveryTime: '2026-09-03T02:00:00.000Z',
        points: [],
      }),
      restorePitr: async () => undefined,
    };
    const provider = new ProviderIdentityRecoveryProvider({
      recoveryProvider,
      requiredRecoveryTimeUnix: Date.parse('2026-09-03T01:00:00.000Z') / 1000,
    });

    await expect(provider.verifyCoverage()).resolves.toMatchObject({
      covered: true,
      method: 'VERIFIED_PROVIDER_RECOVERY',
    });
  });

  it('fails closed when provider recovery is disabled or does not cover the selected recovery time', async () => {
    const recoveryProvider: DatabaseRecoveryProvider = {
      listRecoveryPoints: async () => ({
        enabled: false,
        earliestRecoveryTime: null,
        latestRecoveryTime: null,
        points: [],
      }),
      restorePitr: async () => undefined,
    };
    const provider = new ProviderIdentityRecoveryProvider({
      recoveryProvider,
      requiredRecoveryTimeUnix: Date.parse('2026-09-03T01:00:00.000Z') / 1000,
    });

    await expect(provider.verifyCoverage()).resolves.toMatchObject({
      covered: false,
      method: 'PROVIDER_RECOVERY_UNAVAILABLE',
    });
  });
});

describe('WASDOK-55 Storage object archive provider', () => {
  it('exports private Storage object bytes plus checksum manifest and skips public buckets', async () => {
    const workDir = await temporaryDirectory();
    const objectBytes = new TextEncoder().encode('hello');
    const expectedChecksum = createHash('sha256').update(objectBytes).digest('hex');

    const client: SupabaseStorageClientLike = {
      storage: {
        listBuckets: async () => ({
          data: [
            { id: 'private-evidence', name: 'private-evidence', public: false },
            { id: 'public-assets', name: 'public-assets', public: true },
          ],
          error: null,
        }),
        from: (bucketId: string) => ({
          list: async (path: string) => {
            if (bucketId === 'public-assets') throw new Error('public bucket must not be enumerated');
            if (path === '') {
              return { data: [{ id: 'object-1', name: 'evidence.txt', metadata: { size: 5 } }], error: null };
            }
            return { data: [], error: null };
          },
          download: async (path: string) => {
            expect(bucketId).toBe('private-evidence');
            expect(path).toBe('evidence.txt');
            return { data: new Blob([objectBytes]), error: null };
          },
        }),
      },
    };

    const provider = new SupabaseStorageArchiveProvider({ client });
    const result = await provider.exportFull(workDir);

    expect(result.objectCount).toBe(1);
    expect(result.byteSize).toBe(5);
    expect(result.files.map(basename)).toContain('storage_manifest.json');

    const objectPath = join(workDir, 'storage', 'private-evidence', 'evidence.txt');
    expect(new Uint8Array(await readFile(objectPath))).toEqual(objectBytes);

    const manifestPath = result.files.find((file) => basename(file) === 'storage_manifest.json');
    expect(manifestPath).toBeTruthy();
    const manifest = JSON.parse(await readFile(manifestPath!, 'utf8'));
    expect(manifest).toEqual({
      version: 1,
      bucketCount: 1,
      objectCount: 1,
      byteSize: 5,
      objects: [
        {
          bucket: 'private-evidence',
          path: 'evidence.txt',
          byteSize: 5,
          checksumSha256: expectedChecksum,
        },
      ],
    });
  });
});

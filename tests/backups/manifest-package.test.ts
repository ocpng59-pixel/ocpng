import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readFile as readFileBytes, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  serializeRecoveryManifest,
  verifyRecoveryManifest,
  type RecoveryManifest,
} from '@/lib/operations/backups/manifest';
import {
  packageEncryptedArchive,
  verifyEncryptedArchive,
} from '@/lib/operations/backups/package';
import { ResolverArchiveKeyProvider } from '@/lib/operations/backups/providers/archive-key';
import {
  SupabaseArchiveStore,
  type SupabaseArchiveStorageClientLike,
} from '@/lib/operations/backups/providers/archive-store';
import {
  SupabaseCliDatabaseArchiveProvider,
  type DatabaseDumpCommand,
} from '@/lib/operations/backups/providers/database-archive';
import { ProviderIdentityRecoveryProvider } from '@/lib/operations/backups/providers/identity-recovery';
import {
  SupabaseStorageArchiveProvider,
  type SupabaseStorageClientLike,
} from '@/lib/operations/backups/providers/storage-archive';
import type {
  ArchiveKeyProvider,
  DatabaseRecoveryProvider,
} from '@/lib/operations/backups/provider-types';

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

    expect(result.files.map((file) => basename(file)).sort()).toEqual([
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
    expect(result.files.map((file) => basename(file))).toContain('storage_manifest.json');

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

describe('WASDOK-55 encrypted archive packaging and custody', () => {
  it('streams a ZIP through AES-256-GCM, records safe metadata and zeroes the obtained key buffer', async () => {
    const workDir = await temporaryDirectory();
    const fileA = join(workDir, 'roles.sql');
    const fileB = join(workDir, 'storage_manifest.json');
    await writeFile(fileA, '-- DEMO roles\n', 'utf8');
    await writeFile(fileB, '{"demo":true}\n', 'utf8');

    const keyMaterial = Buffer.alloc(32, 7);
    const keyProvider: ArchiveKeyProvider = {
      getEncryptionKey: async () => keyMaterial,
    };

    const packaged = await packageEncryptedArchive({
      backupId: '55000000-0000-0000-0000-000000000501',
      inputFiles: [fileA, fileB],
      outputDirectory: workDir,
      keyRef: 'kms://ocpng/backup-key-v1',
      keyProvider,
    });

    expect(packaged.filePath.endsWith('.zip.enc')).toBe(true);
    expect(packaged.byteSize).toBeGreaterThan(0);
    expect(packaged.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(packaged.encryption).toMatchObject({
      algorithm: 'AES-256-GCM',
      keyRef: 'kms://ocpng/backup-key-v1',
    });
    expect(packaged.encryption.nonceBase64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(packaged.encryption.authTagBase64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(JSON.stringify(packaged)).not.toContain(Buffer.alloc(32, 7).toString('base64'));
    expect([...keyMaterial].every((value) => value === 0)).toBe(true);

    const artifact = await readFileBytes(packaged.filePath);
    expect(createHash('sha256').update(artifact).digest('hex')).toBe(packaged.checksumSha256);

    const source = readFileSync('lib/operations/backups/package.ts', 'utf8');
    expect(source).toContain("from 'archiver'");
    expect(source).toMatch(/archive\.pipe\(cipher\)/);
    expect(source).not.toMatch(/readFile(?:Sync)?\(/);
  });

  it('verifies an untampered encrypted archive and rejects changed ciphertext', async () => {
    const workDir = await temporaryDirectory();
    const input = join(workDir, 'data.sql');
    await writeFile(input, 'DEMO DATABASE EXPORT\n', 'utf8');
    const rawKey = Buffer.alloc(32, 11);
    const keyProvider = new ResolverArchiveKeyProvider(async () => Buffer.from(rawKey));

    const packaged = await packageEncryptedArchive({
      backupId: '55000000-0000-0000-0000-000000000502',
      inputFiles: [input],
      outputDirectory: workDir,
      keyRef: 'kms://ocpng/backup-key-v1',
      keyProvider,
    });

    await expect(verifyEncryptedArchive({ artifact: packaged, keyProvider })).resolves.toBe(true);

    const tampered = Buffer.from(await readFile(packaged.filePath));
    tampered[Math.max(0, tampered.length - 1)] ^= 0xff;
    await writeFile(packaged.filePath, tampered);
    await expect(verifyEncryptedArchive({ artifact: packaged, keyProvider })).rejects.toThrow(/integrity|checksum|authentication/i);
  });

  it('rejects archive keys that are not exactly 256 bits', async () => {
    const provider = new ResolverArchiveKeyProvider(async () => Buffer.alloc(31, 1));
    await expect(provider.getEncryptionKey('kms://ocpng/backup-key-v1')).rejects.toThrow(/256-bit/i);
  });

  it('stores only encrypted artifacts in the configured private bucket and creates bounded signed download grants', async () => {
    const workDir = await temporaryDirectory();
    const artifactPath = join(workDir, 'BKP-2026-000001.zip.enc');
    const artifactBytes = Buffer.from('DEMO ENCRYPTED ARTIFACT');
    await writeFile(artifactPath, artifactBytes);
    const checksumSha256 = createHash('sha256').update(artifactBytes).digest('hex');
    const calls: Array<Record<string, unknown>> = [];

    const client: SupabaseArchiveStorageClientLike = {
      storage: {
        from: (bucket: string) => ({
          upload: async (path, body, options) => {
            calls.push({ kind: 'upload', bucket, path, body, options });
            return { data: { path }, error: null };
          },
          createSignedUrl: async (path, expiresIn) => {
            calls.push({ kind: 'signed', bucket, path, expiresIn });
            return { data: { signedUrl: 'https://example.invalid/demo-signed-url' }, error: null };
          },
        }),
      },
    };

    const store = new SupabaseArchiveStore({ client, bucket: 'wasdok-backups' });
    const stored = await store.putEncryptedArtifact({
      filePath: artifactPath,
      backupId: '55000000-0000-0000-0000-000000000503',
      checksumSha256,
      keyRef: 'kms://ocpng/backup-key-v1',
      contentType: 'application/octet-stream',
    });

    expect(stored.ref).toBe('55000000-0000-0000-0000-000000000503/BKP-2026-000001.zip.enc');
    expect(stored.byteSize).toBe(artifactBytes.byteLength);
    expect(stored.checksumSha256).toBe(checksumSha256);
    expect(calls[0]).toMatchObject({
      kind: 'upload',
      bucket: 'wasdok-backups',
      path: stored.ref,
    });

    await expect(store.createDownloadGrant(stored.ref, 300)).resolves.toBe('https://example.invalid/demo-signed-url');
    expect(calls[1]).toMatchObject({ kind: 'signed', expiresIn: 300 });
    await expect(store.createDownloadGrant(stored.ref, 3600)).rejects.toThrow(/expiry/i);
  });
});

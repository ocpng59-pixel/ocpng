import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ObjectArchiveProvider } from '../provider-types';
import type { ObjectArchiveResult, StorageCheckpoint } from '../types';

type StorageBucket = {
  id: string;
  name: string;
  public?: boolean;
};

type StorageListItem = {
  id?: string | null;
  name: string;
  metadata?: Record<string, unknown> | null;
  updated_at?: string | null;
};

type StorageResult<T> = Promise<{ data: T | null; error: unknown | null }>;

export type SupabaseStorageClientLike = {
  storage: {
    listBuckets(): StorageResult<StorageBucket[]>;
    from(bucketId: string): {
      list(
        path: string,
        options?: {
          limit?: number;
          offset?: number;
          sortBy?: { column: string; order: 'asc' | 'desc' };
        },
      ): StorageResult<StorageListItem[]>;
      download(path: string): StorageResult<Blob>;
    };
  };
};

type SupabaseStorageArchiveProviderOptions = {
  client: SupabaseStorageClientLike;
};

type StorageManifestObject = {
  bucket: string;
  path: string;
  byteSize: number;
  checksumSha256: string;
};

function safePathSegment(value: string): string {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new Error('Unsafe Storage object path.');
  }
  return value;
}

function shouldIncludeIncremental(item: StorageListItem, checkpoint?: StorageCheckpoint): boolean {
  if (!checkpoint) return true;
  if (!item.updated_at) return true;
  const updated = Date.parse(item.updated_at);
  const observed = Date.parse(checkpoint.observedAt);
  if (!Number.isFinite(updated) || !Number.isFinite(observed)) return true;
  return updated > observed;
}

export class SupabaseStorageArchiveProvider implements ObjectArchiveProvider {
  private readonly client: SupabaseStorageClientLike;

  constructor(options: SupabaseStorageArchiveProviderOptions) {
    this.client = options.client;
  }

  async exportFull(workDir: string): Promise<ObjectArchiveResult> {
    return this.exportObjects(workDir);
  }

  async exportIncremental(workDir: string, checkpoint: StorageCheckpoint): Promise<ObjectArchiveResult> {
    return this.exportObjects(workDir, checkpoint);
  }

  private async exportObjects(
    workDir: string,
    checkpoint?: StorageCheckpoint,
  ): Promise<ObjectArchiveResult> {
    const startedAt = new Date().toISOString();
    const bucketsResult = await this.client.storage.listBuckets();
    if (bucketsResult.error || !bucketsResult.data) {
      throw new Error('Storage bucket listing failed.');
    }

    const privateBuckets = bucketsResult.data.filter((bucket) => bucket.public !== true);
    const manifestObjects: StorageManifestObject[] = [];
    const files: string[] = [];
    let byteSize = 0;

    for (const bucket of privateBuckets) {
      const bucketId = safePathSegment(bucket.id);
      await this.exportBucket({
        bucketId,
        bucketPath: '',
        workDir,
        checkpoint,
        manifestObjects,
        files,
        addBytes: (size) => { byteSize += size; },
      });
    }

    manifestObjects.sort((left, right) =>
      `${left.bucket}/${left.path}`.localeCompare(`${right.bucket}/${right.path}`),
    );

    const manifest = {
      version: 1,
      bucketCount: privateBuckets.length,
      objectCount: manifestObjects.length,
      byteSize,
      objects: manifestObjects,
    };
    const manifestPath = join(workDir, 'storage_manifest.json');
    await mkdir(dirname(manifestPath), { recursive: true, mode: 0o700 });
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { encoding: 'utf8', mode: 0o600 });
    files.push(manifestPath);

    return {
      files,
      objectCount: manifestObjects.length,
      byteSize,
      checkpoint: { observedAt: startedAt, cursor: null },
      safeMetadata: {
        provider: 'supabase_storage_api',
        bucketCount: privateBuckets.length,
        objectCount: manifestObjects.length,
        incrementalFrom: checkpoint?.observedAt ?? null,
      },
    };
  }

  private async exportBucket(input: {
    bucketId: string;
    bucketPath: string;
    workDir: string;
    checkpoint?: StorageCheckpoint;
    manifestObjects: StorageManifestObject[];
    files: string[];
    addBytes: (size: number) => void;
  }): Promise<void> {
    const bucket = this.client.storage.from(input.bucketId);
    let offset = 0;

    for (;;) {
      const listed = await bucket.list(input.bucketPath, {
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (listed.error || !listed.data) throw new Error('Storage object listing failed.');

      for (const item of listed.data) {
        const name = safePathSegment(item.name);
        const objectPath = input.bucketPath ? `${input.bucketPath}/${name}` : name;
        const isFolder = item.id == null && item.metadata == null;

        if (isFolder) {
          await this.exportBucket({ ...input, bucketPath: objectPath });
          continue;
        }
        if (!shouldIncludeIncremental(item, input.checkpoint)) continue;

        const downloaded = await bucket.download(objectPath);
        if (downloaded.error || !downloaded.data) throw new Error('Storage object download failed.');
        const bytes = Buffer.from(await downloaded.data.arrayBuffer());
        const checksumSha256 = createHash('sha256').update(bytes).digest('hex');
        const outputPath = join(input.workDir, 'storage', input.bucketId, ...objectPath.split('/'));
        await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
        await writeFile(outputPath, bytes, { mode: 0o600 });

        input.manifestObjects.push({
          bucket: input.bucketId,
          path: objectPath,
          byteSize: bytes.byteLength,
          checksumSha256,
        });
        input.files.push(outputPath);
        input.addBytes(bytes.byteLength);
      }

      if (listed.data.length < 1000) break;
      offset += listed.data.length;
    }
  }
}

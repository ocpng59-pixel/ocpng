import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { ArchiveStore } from '../provider-types';
import type { ArchiveStoredReference, ArchiveStorePutInput } from '../types';

type StorageResult<T> = Promise<{ data: T | null; error: unknown | null }>;

export type SupabaseArchiveStorageClientLike = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: unknown,
        options?: { contentType?: string; upsert?: boolean },
      ): StorageResult<{ path: string }>;
      createSignedUrl(path: string, expiresIn: number): StorageResult<{ signedUrl: string }>;
    };
  };
};

type SupabaseArchiveStoreOptions = {
  client: SupabaseArchiveStorageClientLike;
  bucket: string;
};

function safeStoragePart(value: string, field: string): string {
  const clean = value.trim();
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(clean) || clean === '.' || clean === '..') {
    throw new Error(`Invalid archive ${field}.`);
  }
  return clean;
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export class SupabaseArchiveStore implements ArchiveStore {
  private readonly client: SupabaseArchiveStorageClientLike;
  private readonly bucket: string;

  constructor(options: SupabaseArchiveStoreOptions) {
    this.client = options.client;
    this.bucket = safeStoragePart(options.bucket, 'bucket');
  }

  async putEncryptedArtifact(input: ArchiveStorePutInput): Promise<ArchiveStoredReference> {
    const fileName = safeStoragePart(basename(input.filePath), 'filename');
    if (!fileName.endsWith('.zip.enc')) {
      throw new Error('Only encrypted ZIP artifacts may enter the backup archive store.');
    }
    const backupId = safeStoragePart(input.backupId, 'backup identifier');
    if (!/^[a-fA-F0-9-]{36}$/.test(backupId)) {
      throw new Error('Invalid archive backup identifier.');
    }
    if (!/^[a-f0-9]{64}$/.test(input.checksumSha256)) {
      throw new Error('Invalid archive checksum.');
    }
    if (!input.keyRef.trim()) {
      throw new Error('Archive key reference is required.');
    }

    const actualChecksum = await sha256File(input.filePath);
    if (actualChecksum !== input.checksumSha256) {
      throw new Error('Encrypted archive checksum mismatch before storage.');
    }

    const fileStat = await stat(input.filePath);
    const ref = `${backupId}/${fileName}`;
    const bucket = this.client.storage.from(this.bucket);
    const uploaded = await bucket.upload(ref, createReadStream(input.filePath), {
      contentType: input.contentType ?? 'application/octet-stream',
      upsert: false,
    });
    if (uploaded.error || !uploaded.data) {
      throw new Error('Encrypted backup artifact storage failed.');
    }

    return {
      ref,
      byteSize: fileStat.size,
      checksumSha256: actualChecksum,
    };
  }

  async createDownloadGrant(ref: string, expiresInSeconds: number): Promise<string> {
    const cleanRef = ref.trim();
    if (
      !cleanRef ||
      cleanRef.startsWith('/') ||
      cleanRef.includes('..') ||
      /[\r\n\0]/.test(cleanRef)
    ) {
      throw new Error('Invalid archive reference.');
    }
    if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 30 || expiresInSeconds > 900) {
      throw new Error('Archive download expiry must be between 30 and 900 seconds.');
    }

    const signed = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(cleanRef, expiresInSeconds);
    if (signed.error || !signed.data?.signedUrl) {
      throw new Error('Archive download grant could not be created.');
    }
    return signed.data.signedUrl;
  }
}

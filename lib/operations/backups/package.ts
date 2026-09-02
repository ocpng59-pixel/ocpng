import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ZipArchive } from 'archiver';
import type { ArchiveKeyProvider } from './provider-types';

export type EncryptedArchiveArtifact = {
  filePath: string;
  byteSize: number;
  checksumSha256: string;
  encryption: {
    algorithm: 'AES-256-GCM';
    nonceBase64: string;
    authTagBase64: string;
    keyRef: string;
  };
};

type PackageEncryptedArchiveInput = {
  backupId: string;
  inputFiles: string[];
  outputDirectory: string;
  keyRef: string;
  keyProvider: ArchiveKeyProvider;
};

type VerifyEncryptedArchiveInput = {
  artifact: EncryptedArchiveArtifact;
  keyProvider: ArchiveKeyProvider;
};

function assertKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.byteLength !== 32) {
    if (Buffer.isBuffer(key)) key.fill(0);
    throw new Error('Archive encryption requires a 256-bit key.');
  }
}

function assertSafeIdentifier(value: string, field: string): string {
  const clean = value.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(clean)) {
    throw new Error(`Invalid ${field}.`);
  }
  return clean;
}

function assertKeyRef(value: string): string {
  const clean = value.trim();
  if (!clean || clean.length > 512 || /[\r\n\0]/.test(clean)) {
    throw new Error('Invalid archive key reference.');
  }
  return clean;
}

export async function packageEncryptedArchive(
  input: PackageEncryptedArchiveInput,
): Promise<EncryptedArchiveArtifact> {
  if (!Array.isArray(input.inputFiles) || input.inputFiles.length === 0) {
    throw new Error('At least one archive input file is required.');
  }

  const backupId = assertSafeIdentifier(input.backupId, 'backup identifier');
  const keyRef = assertKeyRef(input.keyRef);
  await mkdir(input.outputDirectory, { recursive: true, mode: 0o700 });

  const outputPath = join(input.outputDirectory, `${backupId}.zip.enc`);
  const key = await input.keyProvider.getEncryptionKey(keyRef);
  assertKey(key);

  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const output = createWriteStream(outputPath, { flags: 'w', mode: 0o600 });
  const hash = createHash('sha256');

  try {
    const completion = new Promise<void>((resolve, reject) => {
      output.once('close', resolve);
      output.once('error', reject);
      cipher.once('error', reject);
      archive.once('error', reject);
    });

    cipher.on('data', (chunk: Buffer) => hash.update(chunk));
    archive.pipe(cipher);
    cipher.pipe(output);

    const usedNames = new Set<string>();
    for (const filePath of input.inputFiles) {
      const archiveName = basename(filePath);
      if (!archiveName || usedNames.has(archiveName)) {
        throw new Error('Archive input filenames must be unique.');
      }
      usedNames.add(archiveName);
      archive.file(filePath, { name: archiveName });
    }

    await archive.finalize();
    await completion;

    const authTag = cipher.getAuthTag();
    const fileStat = await stat(outputPath);
    return {
      filePath: outputPath,
      byteSize: fileStat.size,
      checksumSha256: hash.digest('hex'),
      encryption: {
        algorithm: 'AES-256-GCM',
        nonceBase64: nonce.toString('base64'),
        authTagBase64: authTag.toString('base64'),
        keyRef,
      },
    };
  } finally {
    key.fill(0);
  }
}

export async function verifyEncryptedArchive(
  input: VerifyEncryptedArchiveInput,
): Promise<true> {
  const artifact = input.artifact;
  if (artifact.encryption.algorithm !== 'AES-256-GCM') {
    throw new Error('Encrypted archive integrity verification failed.');
  }

  const nonce = Buffer.from(artifact.encryption.nonceBase64, 'base64');
  const authTag = Buffer.from(artifact.encryption.authTagBase64, 'base64');
  if (nonce.byteLength !== 12 || authTag.byteLength !== 16) {
    throw new Error('Encrypted archive integrity verification failed.');
  }

  const key = await input.keyProvider.getEncryptionKey(artifact.encryption.keyRef);
  assertKey(key);
  const hash = createHash('sha256');
  const encryptedInput = createReadStream(artifact.filePath);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(authTag);
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });

  try {
    encryptedInput.on('data', (chunk) => {
      hash.update(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    await pipeline(encryptedInput, decipher, sink);
    if (hash.digest('hex') !== artifact.checksumSha256) {
      throw new Error('Encrypted archive checksum mismatch.');
    }
    return true;
  } catch {
    throw new Error('Encrypted archive integrity or authentication verification failed.');
  } finally {
    key.fill(0);
  }
}
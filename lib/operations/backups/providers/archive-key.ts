import type { ArchiveKeyProvider } from '../provider-types';

type ArchiveKeyResolver = (keyRef: string) => Promise<Buffer>;

export class ResolverArchiveKeyProvider implements ArchiveKeyProvider {
  private readonly resolver: ArchiveKeyResolver;

  constructor(resolver: ArchiveKeyResolver) {
    this.resolver = resolver;
  }

  async getEncryptionKey(keyRef: string): Promise<Buffer> {
    const cleanRef = keyRef.trim();
    if (!cleanRef || cleanRef.length > 512 || /[\r\n\0]/.test(cleanRef)) {
      throw new Error('Invalid archive key reference.');
    }

    const key = await this.resolver(cleanRef);
    if (!Buffer.isBuffer(key) || key.byteLength !== 32) {
      if (Buffer.isBuffer(key)) key.fill(0);
      throw new Error('Archive encryption requires a 256-bit key.');
    }
    return key;
  }
}

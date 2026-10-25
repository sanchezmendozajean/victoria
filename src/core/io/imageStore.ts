import { sniffImage, type ImageInfo } from './imageInfo';
import { sha256Hex } from './sha256';

/** The key of an image resource and its file name inside the .vict: the SHA-256 of its bytes. */
export const hashBytes = sha256Hex;

/**
 * The bytes of the images of one document, by content hash. The document itself only holds
 * `resources.images` (size and format); the bytes live here and travel inside the .vict.
 * Nothing is ever removed: an undone placement keeps its bytes so redo needs no reload.
 */
export class ImageStore {
  private readonly bytes = new Map<string, Uint8Array>();

  constructor(initial: Record<string, Uint8Array> = {}) {
    for (const [hash, data] of Object.entries(initial)) this.bytes.set(hash, data);
  }

  has(hash: string): boolean {
    return this.bytes.has(hash);
  }

  get(hash: string): Uint8Array | undefined {
    return this.bytes.get(hash);
  }

  set(hash: string, data: Uint8Array): void {
    this.bytes.set(hash, data);
  }

  /** Hashes and keeps an image file. Null when it is not a PNG, JPEG or WebP. */
  add(data: Uint8Array): { hash: string; info: ImageInfo } | null {
    const info = sniffImage(data);
    if (!info) return null;
    const hash = hashBytes(data);
    if (!this.bytes.has(hash)) this.bytes.set(hash, data);
    return { hash, info };
  }

  /** The images to write into a .vict: only the ones the document still lists as resources. */
  toRecord(listed: Iterable<string>): Record<string, Uint8Array> {
    const out: Record<string, Uint8Array> = {};
    for (const hash of listed) {
      const data = this.bytes.get(hash);
      if (data) out[hash] = data;
    }
    return out;
  }
}

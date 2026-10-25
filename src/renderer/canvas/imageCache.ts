import type { ImageStore } from '../../core';

/**
 * Decoded images by content hash. Decoding is asynchronous, so the first request returns null and
 * `onReady` fires once the bitmap exists (the canvas then repaints). Content-addressed, so one entry
 * serves every document that uses the same file.
 */
type Entry = ImageBitmap | 'loading' | 'failed';

const MAX_ENTRIES = 64;
const entries = new Map<string, Entry>();
const waiting = new Map<string, Set<() => void>>();

function remember(hash: string, entry: Entry): void {
  entries.delete(hash);
  entries.set(hash, entry); // most recently used last
  while (entries.size > MAX_ENTRIES) {
    const [oldest] = entries.keys();
    if (oldest === undefined) break;
    const value = entries.get(oldest);
    if (value && typeof value !== 'string') value.close();
    entries.delete(oldest);
  }
}

export function bitmapFor(store: ImageStore, hash: string, onReady?: () => void): ImageBitmap | null {
  const entry = entries.get(hash);
  if (entry && typeof entry !== 'string') {
    remember(hash, entry);
    return entry;
  }
  if (entry === 'failed') return null;
  if (onReady) {
    const set = waiting.get(hash) ?? new Set();
    set.add(onReady);
    waiting.set(hash, set);
  }
  if (entry === 'loading') return null;
  const bytes = store.get(hash);
  if (!bytes) return null;
  remember(hash, 'loading');
  createImageBitmap(new Blob([bytes as BlobPart]))
    .then((bitmap) => remember(hash, bitmap))
    .catch(() => remember(hash, 'failed'))
    .finally(() => {
      const callbacks = waiting.get(hash);
      waiting.delete(hash);
      callbacks?.forEach((cb) => cb());
    });
  return null;
}

/** Whether the file could be decoded (false while loading or when it is damaged). */
export const isDecoded = (hash: string): boolean => {
  const entry = entries.get(hash);
  return !!entry && typeof entry !== 'string';
};

/** Decodes an image and waits for it (exporting needs every picture ready before it draws). Null when missing or damaged. */
export async function loadBitmap(store: ImageStore, hash: string): Promise<ImageBitmap | null> {
  const ready = bitmapFor(store, hash);
  if (ready) return ready;
  if (entries.get(hash) === 'failed' || !store.has(hash)) return null;
  await new Promise<void>((resolve) => {
    if (bitmapFor(store, hash, resolve) || entries.get(hash) === 'failed') resolve();
  });
  return bitmapFor(store, hash);
}

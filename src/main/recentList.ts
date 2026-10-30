import path from 'node:path';

export const MAX_RECENT = 12;

/** `file` moved to the front (no duplicates, compared as the file system would), at most `max` kept. */
export function pushRecent(list: readonly string[], file: string, max = MAX_RECENT): string[] {
  const same = (a: string, b: string) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  return [file, ...list.filter((entry) => !same(entry, file))].slice(0, max);
}

/** What was stored on disk is untrusted: only absolute paths of .vict files survive. */
export function sanitizeRecent(raw: unknown, max = MAX_RECENT): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && path.isAbsolute(entry) && path.extname(entry).toLowerCase() === '.vict' && !out.includes(entry)) out.push(entry);
  }
  return out.slice(0, max);
}

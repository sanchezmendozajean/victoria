import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** What was stored on disk is untrusted: only an absolute path survives. */
export function sanitizeLastDir(raw: unknown): string | null {
  const dir = typeof raw === 'object' && raw !== null ? (raw as { dir?: unknown }).dir : undefined;
  return typeof dir === 'string' && path.isAbsolute(dir) ? dir : null;
}

export async function loadLastDir(file: string): Promise<string | null> {
  try {
    return sanitizeLastDir(JSON.parse(await readFile(file, 'utf8')));
  } catch {
    return null;
  }
}

export async function saveLastDir(file: string, dir: string): Promise<void> {
  try {
    await writeFile(file, JSON.stringify({ dir }), 'utf8');
  } catch {
    // A convenience: failing to remember the folder must not fail the open or the save.
  }
}

/** `dir` when it is a folder that still exists, otherwise `fallback` (the folder may have been moved or be on an unplugged drive). */
export async function existingDir(dir: string | null, fallback: string): Promise<string> {
  if (!dir) return fallback;
  try {
    return (await stat(dir)).isDirectory() ? dir : fallback;
  } catch {
    return fallback;
  }
}

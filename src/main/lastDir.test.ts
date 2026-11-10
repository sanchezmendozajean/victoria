import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existingDir, loadLastDir, sanitizeLastDir, saveLastDir } from './lastDir';

describe('last folder', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'victoria-lastdir-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('only an absolute path is accepted from storage', () => {
    expect(sanitizeLastDir({ dir: path.join(tmpdir(), 'x') })).toBe(path.join(tmpdir(), 'x'));
    expect(sanitizeLastDir({ dir: 'relative/folder' })).toBeNull();
    expect(sanitizeLastDir({ dir: 7 })).toBeNull();
    expect(sanitizeLastDir(null)).toBeNull();
    expect(sanitizeLastDir('x')).toBeNull();
  });

  it('is saved and read back, and a missing or corrupt file gives null', async () => {
    const file = path.join(dir, 'last-folder.json');
    expect(await loadLastDir(file)).toBeNull();
    await saveLastDir(file, dir);
    expect(await loadLastDir(file)).toBe(dir);
    await writeFile(file, '{not json');
    expect(await loadLastDir(file)).toBeNull();
  });

  it('saving into an unwritable place does not throw', async () => {
    await expect(saveLastDir(path.join(dir, 'no', 'such', 'folder', 'f.json'), dir)).resolves.toBeUndefined();
  });

  it('falls back when the folder no longer exists or is not a folder', async () => {
    const file = path.join(dir, 'a-file.txt');
    await writeFile(file, 'x');
    expect(await existingDir(dir, 'fallback')).toBe(dir);
    expect(await existingDir(path.join(dir, 'gone'), 'fallback')).toBe('fallback');
    expect(await existingDir(file, 'fallback')).toBe('fallback');
    expect(await existingDir(null, 'fallback')).toBe('fallback');
  });
});

import { app, dialog, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AutosaveEntry, DialogLabels, OpenedFile, SaveRequest, SaveResult } from '../shared/ipc';

const EXTENSION = 'vict';
const DOC_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

/** Paths the user picked in a native dialog; the renderer may only save to these without asking again. */
const granted = new Set<string>();

/** Temp file + rename, so a crash never leaves a half-written document (specs/02). */
export async function writeFileAtomic(target: string, bytes: Uint8Array): Promise<void> {
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, bytes);
    await rename(temp, target);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

function isLabels(v: unknown): v is DialogLabels {
  if (typeof v !== 'object' || v === null) return false;
  const labels = v as Partial<DialogLabels>;
  return typeof labels.title === 'string' && typeof labels.filterName === 'string';
}

const withExtension = (file: string) => (path.extname(file).toLowerCase() === `.${EXTENSION}` ? file : `${file}.${EXTENSION}`);

export async function openFile(win: BrowserWindow, labels: unknown): Promise<OpenedFile | null> {
  if (!isLabels(labels)) throw new Error('Invalid dialog labels');
  const result = await dialog.showOpenDialog(win, {
    title: labels.title,
    defaultPath: app.getPath('documents'),
    properties: ['openFile'],
    filters: [{ name: labels.filterName, extensions: [EXTENSION] }, ...(labels.importFilterName ? [{ name: labels.importFilterName, extensions: ['eps', 'epsf'] }] : [])],
  });
  const file = result.filePaths[0];
  if (result.canceled || !file) return null;
  if ((await stat(file)).size > MAX_FILE_BYTES) throw new Error('File too large');
  granted.add(file);
  return { path: file, bytes: new Uint8Array(await readFile(file)) };
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
const MAX_IMAGE_BYTES = 512 * 1024 * 1024;

/** Several images at once; paths are not granted for saving (they are only read). */
export async function openImages(win: BrowserWindow, labels: unknown): Promise<OpenedFile[]> {
  if (!isLabels(labels)) throw new Error('Invalid dialog labels');
  const result = await dialog.showOpenDialog(win, {
    title: labels.title,
    defaultPath: app.getPath('pictures'),
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: labels.filterName, extensions: IMAGE_EXTENSIONS }],
  });
  if (result.canceled) return [];
  const opened: OpenedFile[] = [];
  for (const file of result.filePaths) {
    if ((await stat(file)).size > MAX_IMAGE_BYTES) continue;
    opened.push({ path: file, bytes: new Uint8Array(await readFile(file)) });
  }
  return opened;
}

export async function saveFile(win: BrowserWindow, request: SaveRequest): Promise<SaveResult | null> {
  if (!request || !isLabels(request.labels) || typeof request.suggestedName !== 'string' || !(request.bytes instanceof Uint8Array)) {
    throw new Error('Invalid save request');
  }
  let target = request.path !== null && granted.has(request.path) ? request.path : null;
  if (!target) {
    const safeName = path.basename(request.suggestedName) || `Documento.${EXTENSION}`;
    const result = await dialog.showSaveDialog(win, {
      title: request.labels.title,
      defaultPath: path.join(app.getPath('documents'), withExtension(safeName)),
      filters: [{ name: request.labels.filterName, extensions: [EXTENSION] }],
    });
    if (result.canceled || !result.filePath) return null;
    target = withExtension(result.filePath);
    granted.add(target);
  }
  await writeFileAtomic(target, request.bytes);
  return { path: target };
}

// ── Autosave: <userData>/autosave/<docId>.vict ──

const autosaveDir = () => path.join(app.getPath('userData'), 'autosave');

function autosavePath(docId: unknown): string {
  if (typeof docId !== 'string' || !DOC_ID.test(docId)) throw new Error('Invalid document id');
  return path.join(autosaveDir(), `${docId}.${EXTENSION}`);
}

export async function autosaveWrite(docId: unknown, bytes: unknown): Promise<void> {
  if (!(bytes instanceof Uint8Array)) throw new Error('Invalid autosave data');
  const target = autosavePath(docId);
  await mkdir(autosaveDir(), { recursive: true });
  await writeFileAtomic(target, bytes);
}

export async function autosaveDiscard(docId: unknown): Promise<void> {
  await unlink(autosavePath(docId)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

export async function autosaveList(): Promise<AutosaveEntry[]> {
  const entries = await readdir(autosaveDir()).catch(() => [] as string[]);
  const out: AutosaveEntry[] = [];
  for (const name of entries) {
    const docId = path.basename(name, `.${EXTENSION}`);
    if (!name.endsWith(`.${EXTENSION}`) || !DOC_ID.test(docId)) continue;
    const info = await stat(path.join(autosaveDir(), name)).catch(() => null);
    if (info) out.push({ docId, modified: info.mtimeMs });
  }
  return out.sort((a, b) => b.modified - a.modified);
}

export async function autosaveRead(docId: unknown): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(autosavePath(docId)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

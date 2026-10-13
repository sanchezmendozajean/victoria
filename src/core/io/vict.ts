import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { CURRENT_FORMAT_VERSION } from '../model/factory';
import type { Document, ImageResource } from '../model/types';
import { migrateDocument, type RawDocument } from './migrations';
import { assertDocument, DocumentFormatError } from './validate';

/** `.vict` is a ZIP (specs/02 · Formato .vict). */
export interface VictManifest {
  format: 'victoria';
  version: number;
  /** Version of the app that wrote the file. */
  app: string;
}

export interface VictContents {
  manifest: VictManifest;
  document: Document;
  /** Embedded images by content hash. */
  images: Record<string, Uint8Array>;
  /** Embedded fonts by content hash. */
  fonts: Record<string, Uint8Array>;
  /** 256 px preview of the active Space. */
  thumbnail?: Uint8Array;
}

export interface VictWriteInput {
  document: Document;
  app: string;
  images?: Record<string, Uint8Array>;
  fonts?: Record<string, Uint8Array>;
  thumbnail?: Uint8Array;
}

const MAX_ENTRY_BYTES = 512 * 1024 * 1024; // refuses zip bombs
const HASH = /^[A-Za-z0-9_-]{1,128}$/;
const IMAGE_EXT: Record<ImageResource['format'], string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };
const EXT_IMAGE = ['png', 'jpg', 'webp'];

export function writeVict(input: VictWriteInput): Uint8Array {
  const manifest: VictManifest = { format: 'victoria', version: CURRENT_FORMAT_VERSION, app: input.app };
  const files: Zippable = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'document.json': strToU8(JSON.stringify(input.document)),
  };
  for (const [hash, bytes] of Object.entries(input.images ?? {})) {
    if (!HASH.test(hash)) throw new Error(`Invalid image hash "${hash}"`);
    const format = input.document.resources.images[hash]?.format ?? 'png';
    files[`images/${hash}.${IMAGE_EXT[format]}`] = [bytes, { level: 0 }]; // already compressed
  }
  for (const [hash, bytes] of Object.entries(input.fonts ?? {})) {
    if (!HASH.test(hash)) throw new Error(`Invalid font hash "${hash}"`);
    files[`fonts/${hash}.otf`] = [bytes, { level: 6 }];
  }
  if (input.thumbnail) files['thumbnail.png'] = [input.thumbnail, { level: 0 }];
  return zipSync(files);
}

function parseJson(bytes: Uint8Array, name: string): unknown {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    throw new DocumentFormatError(`${name} is not valid JSON`);
  }
}

/** Reads, migrates and validates a `.vict`. Throws DocumentFormatError / UnsupportedVersionError. */
export function readVict(bytes: Uint8Array): VictContents {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, { filter: (file) => file.originalSize <= MAX_ENTRY_BYTES });
  } catch {
    throw new DocumentFormatError('The file is not a valid .vict archive');
  }

  const manifestRaw = entries['manifest.json'];
  const documentRaw = entries['document.json'];
  if (!manifestRaw || !documentRaw) throw new DocumentFormatError('Missing manifest.json or document.json');

  const m = parseJson(manifestRaw, 'manifest.json') as Partial<VictManifest> | null;
  if (!m || m.format !== 'victoria' || typeof m.version !== 'number' || typeof m.app !== 'string') {
    throw new DocumentFormatError('manifest.json is not a Victoria manifest');
  }
  const manifest: VictManifest = { format: 'victoria', version: m.version, app: m.app };

  const raw = parseJson(documentRaw, 'document.json');
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new DocumentFormatError('document.json is not an object');
  const migrated = migrateDocument(raw as RawDocument, manifest.version);
  assertDocument(migrated);

  const images: Record<string, Uint8Array> = {};
  const fonts: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(entries)) {
    const match = /^(images|fonts)\/([^/]+)\.([a-z0-9]+)$/.exec(name);
    if (!match) continue;
    const [, folder, hash, ext] = match as unknown as [string, string, string, string];
    if (!HASH.test(hash)) continue;
    if (folder === 'images' && EXT_IMAGE.includes(ext)) images[hash] = data;
    if (folder === 'fonts') fonts[hash] = data;
  }

  const contents: VictContents = { manifest, document: migrated, images, fonts };
  const thumbnail = entries['thumbnail.png'];
  if (thumbnail) contents.thumbnail = thumbnail;
  return contents;
}

/** Cheap peek used by the recovery list: reads only the document name and timestamps. */
export function peekVict(bytes: Uint8Array): { name: string; modified: string } | null {
  try {
    const { document } = readVict(bytes);
    return { name: document.meta.name, modified: document.meta.modified };
  } catch {
    return null;
  }
}

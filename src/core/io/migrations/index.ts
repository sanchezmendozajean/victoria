import { CURRENT_FORMAT_VERSION } from '../../model/factory';

/** Raw (not yet validated) `document.json`. */
export type RawDocument = Record<string, unknown>;

/** Upgrades a document from version N to N+1. The table is keyed by N. */
export type Migration = (doc: RawDocument) => RawDocument;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 1 → 2: layers became tree nodes (`Layer.type = 'layer'`) so a layer can hold sublayers next to its objects.
 * Idempotent: layers that already carry the type are left alone.
 */
const v1ToV2: Migration = (doc) => {
  const spaces = Array.isArray(doc.spaces) ? doc.spaces : [];
  return {
    ...doc,
    spaces: spaces.map((space) =>
      isRecord(space) && Array.isArray(space.layers)
        ? { ...space, layers: space.layers.map((l) => (isRecord(l) && l.type === undefined ? { ...l, type: 'layer' } : l)) }
        : space,
    ),
  };
};

export const MIGRATIONS: Record<number, Migration> = { 1: v1ToV2 };

export class UnsupportedVersionError extends Error {
  constructor(
    readonly found: number,
    readonly supported: number,
  ) {
    super(`This file uses format version ${found}, newer than the supported ${supported}. Update Victoria to open it.`);
    this.name = 'UnsupportedVersionError';
  }
}

export function migrateDocument(
  raw: RawDocument,
  fromVersion: number,
  target: number = CURRENT_FORMAT_VERSION,
  table: Record<number, Migration> = MIGRATIONS,
): RawDocument {
  if (!Number.isInteger(fromVersion) || fromVersion < 1) throw new Error(`Invalid format version: ${fromVersion}`);
  if (fromVersion > target) throw new UnsupportedVersionError(fromVersion, target);
  let doc = raw;
  for (let v = fromVersion; v < target; v++) {
    const step = table[v];
    if (!step) throw new Error(`Missing migration from format version ${v} to ${v + 1}`);
    doc = step(doc);
    const meta = doc.meta;
    if (typeof meta === 'object' && meta !== null) (meta as Record<string, unknown>).version = v + 1;
  }
  return doc;
}

import { CURRENT_FORMAT_VERSION } from '../../model/factory';

/** Raw (not yet validated) `document.json`. */
export type RawDocument = Record<string, unknown>;

/** Upgrades a document from version N to N+1. The table is keyed by N. */
export type Migration = (doc: RawDocument) => RawDocument;

/** Version 1 is the first format: nothing to migrate yet. Add `1: (doc) => …` when version 2 is born. */
export const MIGRATIONS: Record<number, Migration> = {};

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

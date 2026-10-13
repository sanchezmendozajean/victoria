import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { DocumentSession } from '../commands/session';
import { addImageResource, addNode } from '../commands';
import { createRect } from '../model/factory';
import { createRng, randomCommand, sampleDocument, sequentialIds } from '../testing/random-ops';
import { migrateDocument, UnsupportedVersionError, type Migration } from './migrations';
import { peekVict, readVict, writeVict } from './vict';
import { DocumentFormatError } from './validate';

function busyDocument(seed: number, ops = 1000) {
  const ids = sequentialIds(`v${seed}`);
  const session = new DocumentSession(sampleDocument(ids), { ids, historyLimit: 5000 });
  const rng = createRng(seed);
  for (let applied = 0; applied < ops; ) if (session.run(randomCommand(rng, session.document, ids))) applied++;
  return session.document;
}

describe('.vict round trip', () => {
  it('is lossless for a document built by 1000 random operations', () => {
    for (const seed of [11, 12, 13]) {
      const document = busyDocument(seed);
      const read = readVict(writeVict({ document, app: '0.2.0' }));
      expect(read.document).toEqual(document);
      expect(read.manifest).toEqual({ format: 'victoria', version: 2, app: '0.2.0' });
    }
  });

  it('keeps embedded images, fonts and the thumbnail byte for byte', () => {
    const ids = sequentialIds('i');
    const session = new DocumentSession(sampleDocument(ids), { ids });
    session.run(addImageResource('abc123', { width: 2, height: 2, format: 'png' }));
    session.run(addImageResource('def456', { width: 4, height: 4, format: 'jpeg' }));
    const png = Uint8Array.from({ length: 300 }, (_, i) => (i * 7) % 256);
    const jpg = Uint8Array.from({ length: 50 }, (_, i) => 255 - i);
    const font = Uint8Array.from([1, 2, 3, 4, 5]);
    const thumb = Uint8Array.from([9, 9, 9]);
    const read = readVict(
      writeVict({ document: session.document, app: 'x', images: { abc123: png, def456: jpg }, fonts: { f1: font }, thumbnail: thumb }),
    );
    expect(read.images.abc123).toEqual(png);
    expect(read.images.def456).toEqual(jpg);
    expect(read.fonts.f1).toEqual(font);
    expect(read.thumbnail).toEqual(thumb);
  });

  it('survives a second round trip unchanged', () => {
    const document = busyDocument(21, 200);
    const once = readVict(writeVict({ document, app: 'x' }));
    const twice = readVict(writeVict({ document: once.document, app: 'x' }));
    expect(twice.document).toEqual(document);
  });

  it('peeks at the name for the recovery list', () => {
    const document = sampleDocument(sequentialIds('p'));
    expect(peekVict(writeVict({ document, app: 'x' }))).toEqual({ name: 'Sample', modified: document.meta.modified });
    expect(peekVict(Uint8Array.from([1, 2, 3]))).toBeNull();
  });

  it('writes the layout of specs/02', () => {
    const files = Object.keys(
      (() => {
        const bytes = writeVict({ document: sampleDocument(sequentialIds('l')), app: 'x', thumbnail: Uint8Array.from([1]) });
        return readZipNames(bytes);
      })(),
    ).sort();
    expect(files).toEqual(['document.json', 'manifest.json', 'thumbnail.png']);
  });
});

import { unzipSync } from 'fflate';
const readZipNames = (bytes: Uint8Array) => unzipSync(bytes);

describe('.vict validation', () => {
  const zip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
  const validDocument = () => JSON.stringify(sampleDocument(sequentialIds('d')));
  const manifest = (version = 1) => JSON.stringify({ format: 'victoria', version, app: 'x' });

  it('rejects files that are not archives', () => {
    expect(() => readVict(Uint8Array.from([1, 2, 3, 4]))).toThrow(DocumentFormatError);
  });

  it('rejects archives without manifest or document', () => {
    expect(() => readVict(zip({ 'document.json': validDocument() }))).toThrow(/manifest/);
    expect(() => readVict(zip({ 'manifest.json': manifest() }))).toThrow(/document/);
  });

  it('rejects foreign manifests and invalid JSON', () => {
    expect(() => readVict(zip({ 'manifest.json': '{"format":"other","version":1,"app":"x"}', 'document.json': validDocument() }))).toThrow(DocumentFormatError);
    expect(() => readVict(zip({ 'manifest.json': manifest(), 'document.json': '{nope' }))).toThrow(/JSON/);
  });

  it('rejects structurally broken documents with the path of the problem', () => {
    const doc = JSON.parse(validDocument());
    doc.spaces[0].layers[0].children = [{ id: 'n', type: 'blob' }];
    expect(() => readVict(zip({ 'manifest.json': manifest(), 'document.json': JSON.stringify(doc) }))).toThrow(/layers\[0\]\.children\[0\]\.type/);
  });

  it('rejects documents with no Space, a dangling active Space or duplicate ids', () => {
    const base = () => JSON.parse(validDocument());
    const noSpaces = base();
    noSpaces.spaces = [];
    const dangling = base();
    dangling.activeSpaceId = 'nope';
    const duplicate = base();
    duplicate.spaces[0].artboards[0].id = duplicate.spaces[0].id;
    for (const bad of [noSpaces, dangling, duplicate]) {
      expect(() => readVict(zip({ 'manifest.json': manifest(), 'document.json': JSON.stringify(bad) }))).toThrow(DocumentFormatError);
    }
  });

  it('refuses to write numbers JSON cannot represent (NaN would become null)', () => {
    const ids = sequentialIds('n');
    const session = new DocumentSession(sampleDocument(ids), { ids });
    const rect = createRect(ids, 10, 10);
    rect.transform[4] = Number.NaN;
    session.run(addNode(session.document.activeSpaceId, session.document.spaces[0]?.layers[0]?.id as string, rect));
    const bytes = writeVict({ document: session.document, app: 'x' });
    expect(() => readVict(bytes)).toThrow(/finite|number/);
  });

  it('ignores unknown files and unsafe names inside the archive', () => {
    const bytes = zipSync({
      'manifest.json': strToU8(manifest()),
      'document.json': strToU8(validDocument()),
      'images/..%2Fevil.png': strToU8('x'),
      'notes.txt': strToU8('hi'),
      'images/ok.png': strToU8('png'),
    });
    const read = readVict(bytes);
    expect(Object.keys(read.images)).toEqual(['ok']);
  });
});

describe('format migrations', () => {
  const v1 = { meta: { version: 1 }, marker: 'v1' } as Record<string, unknown>;

  it('applies each step in order and stamps the version', () => {
    const table: Record<number, Migration> = {
      1: (d) => ({ ...d, step2: true }),
      2: (d) => ({ ...d, step3: true }),
    };
    const out = migrateDocument(v1, 1, 3, table);
    expect(out).toMatchObject({ marker: 'v1', step2: true, step3: true, meta: { version: 3 } });
  });

  it('leaves up-to-date documents alone', () => {
    expect(migrateDocument(v1, 1, 1, {})).toBe(v1);
  });

  it('refuses files from the future', () => {
    expect(() => migrateDocument(v1, 5, 1, {})).toThrow(UnsupportedVersionError);
  });

  it('fails loudly when a step is missing', () => {
    expect(() => migrateDocument(v1, 1, 2, {})).toThrow(/Missing migration/);
  });

  it('readVict refuses a newer manifest version', () => {
    const bytes = zipSync({
      'manifest.json': strToU8(JSON.stringify({ format: 'victoria', version: 99, app: 'x' })),
      'document.json': strToU8(JSON.stringify(sampleDocument(sequentialIds('f')))),
    });
    expect(() => readVict(bytes)).toThrow(UnsupportedVersionError);
  });
});

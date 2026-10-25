import { describe, expect, it } from 'vitest';
import {
  createDocument,
  createImage,
  DocumentSession,
  getActiveSpace,
  hashBytes,
  ImageStore,
  placeImage,
  readVict,
  sequentialIds,
  writeVict,
  type ImageNode,
} from '..';

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 64, 0, 0, 0, 32, 8, 6, 0, 0, 0, 0, 0, 0, 0,
]);

function setup() {
  const ids = sequentialIds('i');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  return { ids, session: new DocumentSession(doc, { ids }) };
}

describe('image store and placing', () => {
  it('hashes the content, so equal files share one resource', () => {
    const store = new ImageStore();
    const a = store.add(PNG);
    const b = store.add(PNG.slice());
    expect(a?.hash).toBe(b?.hash);
    expect(a?.hash).toBe(hashBytes(PNG));
    expect(a?.info).toMatchObject({ format: 'png', width: 64, height: 32 });
    expect(store.add(Uint8Array.from(new Array(60).fill(7)))).toBeNull();
  });

  it('placing is one undo step; undo drops the object and the resource, redo brings both back', () => {
    const { ids, session } = setup();
    const added = session.images.add(PNG);
    if (!added) throw new Error('not an image');
    const space = getActiveSpace(session.document);
    const layer = space.layers[0]!;
    const node = createImage(ids, added.hash, 64, 32);
    const before = session.historyLength;
    session.run(placeImage(space.id, layer.id, node, { width: 64, height: 32, format: 'png' }));
    expect(session.historyLength).toBe(before + 1);
    expect(session.document.resources.images[added.hash]).toBeDefined();
    session.undo();
    expect(session.document.resources.images[added.hash]).toBeUndefined();
    expect(getActiveSpace(session.document).layers[0]!.children).toHaveLength(0);
    session.redo();
    expect((getActiveSpace(session.document).layers[0]!.children[0] as ImageNode).resourceId).toBe(added.hash);
  });

  it('round-trips through .vict and writes only the images the document lists', () => {
    const { ids, session } = setup();
    const used = session.images.add(PNG);
    const orphan = session.images.add(Uint8Array.from([...PNG.slice(0, 20), 0, 0, 0, 99, ...PNG.slice(24)]));
    if (!used || !orphan) throw new Error('not an image');
    const space = getActiveSpace(session.document);
    session.run(placeImage(space.id, space.layers[0]!.id, createImage(ids, used.hash, 64, 32), { width: 64, height: 32, format: 'png' }));

    const file = writeVict({ document: session.document, app: 't', images: session.images.toRecord(Object.keys(session.document.resources.images)) });
    const back = readVict(file);
    expect(Object.keys(back.images)).toEqual([used.hash]);
    expect(back.images[used.hash]).toEqual(PNG);
    expect(new ImageStore(back.images).has(orphan.hash)).toBe(false);
  });
});

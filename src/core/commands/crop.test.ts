import { describe, expect, it } from 'vitest';
import {
  applyCrop,
  brokenLinks,
  clampCrop,
  createDocument,
  createImage,
  cropImage,
  cropOf,
  DocumentSession,
  effectivePpi,
  getActiveSpace,
  hashesToEmbed,
  imageNodes,
  multiply,
  pixelWindow,
  placeImage,
  recropImage,
  rotation,
  sequentialIds,
  setImageSource,
  translation,
  uncropImage,
  type ImageNode,
} from '..';

function setup() {
  const ids = sequentialIds('i');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids, historyLimit: 50 });
  const space = () => getActiveSpace(session.document);
  const layer = () => space().layers[0]!;
  const place = (width: number, height: number, transform = translation(0, 0), hash = 'h1', px = { width: width * 2, height: height * 2 }) => {
    const node = createImage(ids, hash, width, height, transform);
    session.run(placeImage(space().id, layer().id, node, { ...px, format: 'png' }));
    return node;
  };
  return { ids, session, space, layer, place };
}

describe('crop (Recortar imagen)', () => {
  it('wraps the image in a clipping group masked by a rectangle and reads the window back', () => {
    const { ids, session, space, layer, place } = setup();
    const image = place(200, 100, multiply(translation(50, 30), rotation(0.5)));
    const before = session.historyLength;
    const { command } = cropImage(ids, space().id, image, { x: 20, y: 10, w: 100, h: 60 });
    session.run(command);
    expect(session.historyLength).toBe(before + 1);
    const node = layer().children[0]!;
    expect(node.type).toBe('clipGroup');
    const info = cropOf(node)!;
    expect(info.rect.x).toBeCloseTo(20, 9);
    expect(info.rect.y).toBeCloseTo(10, 9);
    expect([info.rect.w, info.rect.h]).toEqual([100, 60]);
    expect(info.image.id).toBe(image.id);
    // The picture did not move: its world matrix is what it was.
    expect(info.image.transform).toEqual(image.transform);
    session.undo();
    expect(layer().children.map((n) => n.type)).toEqual(['image']);
  });

  it('keeps the window inside the image and not empty', () => {
    const image = { width: 200, height: 100 };
    expect(clampCrop({ x: -10, y: 90, w: 500, h: 50 }, image)).toEqual({ x: 0, y: 50, w: 200, h: 50 });
    expect(clampCrop({ x: 10, y: 10, w: 0, h: -4 }, image)).toEqual({ x: 10, y: 10, w: 1, h: 1 });
  });

  it('re-cropping moves the mask, and removing the crop gives the whole image back', () => {
    const { ids, session, space, layer, place } = setup();
    const image = place(200, 100, translation(10, 10));
    session.run(cropImage(ids, space().id, image, { x: 0, y: 0, w: 200, h: 100 }).command);
    const info = cropOf(layer().children[0]!)!;
    session.run(recropImage(space().id, info, { x: 40, y: 20, w: 80, h: 40 }));
    const again = cropOf(layer().children[0]!)!;
    expect(again.rect).toEqual({ x: 40, y: 20, w: 80, h: 40 });
    expect(again.mask.transform).toEqual(translation(50, 30));
    session.run(uncropImage(space().id, again));
    const back = layer().children[0] as ImageNode;
    expect(back.type).toBe('image');
    expect(back.transform).toEqual(translation(10, 10));
  });

  it('does not take any other clipping group for a crop', () => {
    const { ids, session, space, layer } = setup();
    void session;
    void space;
    void layer;
    expect(cropOf(null)).toBeNull();
    expect(cropOf(createImage(ids, 'x', 1, 1))).toBeNull();
  });

  it('cuts whole pixels: the window snaps to the picture grid', () => {
    const { ids, session, space, layer, place } = setup();
    // 100 x 50 units shown from a 300 x 150 picture: 3 pixels per unit.
    const image = place(100, 50, translation(0, 0), 'h', { width: 300, height: 150 });
    session.run(cropImage(ids, space().id, image, { x: 10.1, y: 5, w: 40.2, h: 20 }).command);
    const info = cropOf(layer().children[0]!)!;
    const window = pixelWindow(info, { width: 300, height: 150 });
    expect(window).toMatchObject({ sx: 30, sy: 15, sw: 121, sh: 60 });
    expect(window.rect.x).toBeCloseTo(10, 9);
    expect(window.rect.w).toBeCloseTo(121 / 3, 9);
  });

  it('applying the crop leaves one smaller image at the same place, as one undo step', () => {
    const { ids, session, space, layer, place } = setup();
    const image = place(100, 50, multiply(translation(20, 20), rotation(0.3)), 'big', { width: 300, height: 150 });
    session.run(cropImage(ids, space().id, image, { x: 30, y: 10, w: 40, h: 30 }).command);
    const info = cropOf(layer().children[0]!)!;
    const window = pixelWindow(info, { width: 300, height: 150 });
    const before = session.historyLength;
    const { command, image: cut } = applyCrop(ids, space().id, info, window, 'cut', { width: window.sw, height: window.sh, format: 'png' });
    session.run(command);
    expect(session.historyLength).toBe(before + 1);
    const node = layer().children[0] as ImageNode;
    expect(node.type).toBe('image');
    expect(node.resourceId).toBe('cut');
    expect(node.width).toBeCloseTo(40, 9);
    expect(node.height).toBeCloseTo(30, 9);
    // Its top left corner is where the window's was.
    const expected = multiply(image.transform, translation(30, 10));
    node.transform.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 9));
    expect(cut.id).toBe(node.id);
    expect(session.document.resources.images['cut']).toEqual({ width: 120, height: 90, format: 'png' });
    session.undo();
    expect(layer().children[0]!.type).toBe('clipGroup');
  });
});

describe('links and resolution', () => {
  it('effective ppi follows the scale of the image on the page', () => {
    // 300 px over 72 pt = 1 inch: 300 ppi; scaled to twice the size: 150 ppi.
    expect(effectivePpi([1, 0, 0, 1, 0, 0], { width: 72 }, { width: 300 })).toBeCloseTo(300, 9);
    expect(effectivePpi([2, 0, 0, 2, 0, 0], { width: 72 }, { width: 300 })).toBeCloseTo(150, 9);
    expect(effectivePpi(rotation(1), { width: 144 }, { width: 300 })).toBeCloseTo(150, 9);
  });

  it('unlinking and relinking keep size and place; the bytes stay out of the file while only linked images use them', () => {
    const { session, space, place } = setup();
    const a = place(10, 10, translation(0, 0), 'one');
    const b = place(10, 10, translation(20, 0), 'one');
    expect(hashesToEmbed(session.document)).toEqual(['one']);
    session.run(setImageSource([{ spaceId: space().id, node: a }], { hash: 'one', resource: { width: 20, height: 20, format: 'png' }, embedded: false, linkedPath: '/pics/a.png' }));
    expect(hashesToEmbed(session.document)).toEqual(['one']); // b still embeds it
    session.run(setImageSource([{ spaceId: space().id, node: b }], { hash: 'one', resource: { width: 20, height: 20, format: 'png' }, embedded: false, linkedPath: '/pics/a.png' }));
    expect(hashesToEmbed(session.document)).toEqual([]);
    const nodes = imageNodes(session.document).map((r) => r.node);
    expect(nodes.map((n) => [n.embedded, n.linkedPath])).toEqual([
      [false, '/pics/a.png'],
      [false, '/pics/a.png'],
    ]);
    expect(brokenLinks(session.document, () => false)).toHaveLength(2);
    expect(brokenLinks(session.document, () => true)).toHaveLength(0);
    // Relink to another file: a new picture, same box.
    const refs = imageNodes(session.document);
    session.run(setImageSource(refs, { hash: 'two', resource: { width: 40, height: 40, format: 'png' }, embedded: false, linkedPath: '/new/b.png' }));
    expect(imageNodes(session.document).every((r) => r.node.resourceId === 'two' && r.node.width === 10)).toBe(true);
    session.undo();
    expect(imageNodes(session.document)[0]!.node.resourceId).toBe('one');
    // Embedding again drops the path.
    session.run(setImageSource(imageNodes(session.document), { hash: 'one', resource: { width: 20, height: 20, format: 'png' }, embedded: true }));
    expect(imageNodes(session.document).every((r) => r.node.embedded && !r.node.linkedPath)).toBe(true);
    expect(hashesToEmbed(session.document)).toEqual(['one']);
  });
});

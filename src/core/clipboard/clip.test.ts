import { describe, expect, it } from 'vitest';
import {
  addGradient,
  addNode,
  addSwatch,
  copyObjects,
  createDocument,
  createGroup,
  createImage,
  createRect,
  decodeClip,
  DocumentSession,
  encodeClip,
  getActiveSpace,
  groupNodes,
  ImageStore,
  nodeWorldBounds,
  pasteCommand,
  placeImage,
  selectOnly,
  sequentialIds,
  translation,
  type Document,
  type Matrix,
  type PasteMode,
  type Node,
} from '..';

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 64, 0, 0, 0, 32, 8, 6, 0, 0, 0, 0, 0, 0, 0,
]);

function setup(prefix = 'c') {
  const ids = sequentialIds(prefix);
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids });
  const space = () => getActiveSpace(session.document);
  const layerId = () => space().layers[0]!.id;
  const rect = (x: number, y: number) => {
    const r = createRect(ids, 10, 10);
    r.transform = translation(x, y);
    session.run(addNode(space().id, layerId(), r));
    return r;
  };
  return { ids, session, space, layerId, rect };
}

const paste = (s: ReturnType<typeof setup>, payload: NonNullable<ReturnType<typeof copyObjects>>, mode: PasteMode, selected: string[] = [], center = { x: 500, y: 300 }) => {
  const result = pasteCommand(s.session.document, s.space(), payload, s.ids, { mode, viewCenter: center, selectedIds: selected, layerId: s.layerId() });
  if (!result) throw new Error('nothing pasted');
  s.session.run(result.command, selectOnly(s.space().id, result.ids));
  return result.ids;
};

const order = (s: ReturnType<typeof setup>) => s.space().layers[0]!.children.map((c) => c.id);

describe('clipboard', () => {
  it('copies in painting order and bakes the transforms of the groups the objects were in', () => {
    const s = setup();
    const a = s.rect(0, 0);
    const b = s.rect(100, 0);
    const group = createGroup(s.ids, []);
    s.session.run(groupNodes(s.space().id, [b.id], group));
    s.session.run({ label: 'move group', apply: (d) => void ((d.spaces[0]!.layers[0]!.children.find((c) => c.id === group.id) as unknown as { transform: Matrix }).transform = translation(0, 50)) });
    const payload = copyObjects(s.session.document, s.space(), [b.id, a.id])!;
    expect(payload.nodes.map((n) => n.id)).toEqual([a.id, b.id]);
    expect(payload.nodes[1]!.transform).toEqual([1, 0, 0, 1, 100, 50]);
    expect(payload.bounds).toMatchObject({ minX: 0, minY: 0, maxX: 110, maxY: 60 });
    expect(copyObjects(s.session.document, s.space(), [])).toBeNull();
  });

  it('paste centres the copy on the view, paste in place keeps the position, both with fresh ids and one undo step', () => {
    const s = setup();
    const a = s.rect(20, 20);
    const payload = copyObjects(s.session.document, s.space(), [a.id])!;
    const before = s.session.historyLength;
    const [centred] = paste(s, payload, 'center');
    expect(s.session.historyLength).toBe(before + 1);
    expect(centred).not.toBe(a.id);
    expect(nodeWorldBounds(s.space(), centred!)).toMatchObject({ minX: 495, minY: 295, maxX: 505, maxY: 305 });
    const [inPlace] = paste(s, payload, 'inPlace');
    expect(nodeWorldBounds(s.space(), inPlace!)).toMatchObject({ minX: 20, minY: 20, maxX: 30, maxY: 30 });
    s.session.undo();
    expect(order(s)).toHaveLength(2);
  });

  it('paste in front goes right above the topmost selected object and paste in back right below the bottom one', () => {
    const s = setup();
    const a = s.rect(0, 0);
    const b = s.rect(20, 0);
    const c = s.rect(40, 0);
    const payload = copyObjects(s.session.document, s.space(), [c.id])!;
    const [front] = paste(s, payload, 'front', [a.id]);
    expect(order(s)).toEqual([a.id, front, b.id, c.id]);
    const [back] = paste(s, payload, 'back', [b.id]);
    expect(order(s)).toEqual([a.id, front, back, b.id, c.id]);
    const [noSelection] = paste(s, payload, 'back');
    expect(order(s)[0]).toBe(noSelection);
  });

  it('paste in all artboards puts one copy in each, at the same place relative to its artboard', () => {
    const s = setup();
    const first = s.space().artboards[0]!;
    const a = s.rect(first.x + 5, first.y + 7);
    const doc = structuredClone(s.session.document) as Document;
    doc.spaces[0]!.artboards.push({ ...first, id: 'second', name: 'Mesa 2', x: first.x + first.w + 100, y: first.y });
    const s2 = new DocumentSession(doc, { ids: s.ids });
    const space2 = getActiveSpace(s2.document);
    const payload = copyObjects(s2.document, space2, [a.id])!;
    const result = pasteCommand(s2.document, space2, payload, s.ids, { mode: 'allArtboards', viewCenter: { x: 0, y: 0 }, selectedIds: [], layerId: space2.layers[0]!.id })!;
    s2.run(result.command);
    expect(result.ids).toHaveLength(2);
    const bounds = result.ids.map((id) => nodeWorldBounds(getActiveSpace(s2.document), id)!);
    expect(bounds[0]!.minX).toBe(first.x + 5);
    expect(bounds[1]!.minX).toBe(first.x + first.w + 100 + 5);
    expect(bounds[1]!.minY).toBe(first.y + 7);
  });

  it('carries swatches, gradients and image bytes to another document', () => {
    const s = setup('a');
    const swatch = { id: 'sw1', name: 'Rojo', color: { model: 'rgb' as const, values: [255, 0, 0] }, global: true };
    const gradient = { id: 'gr1', name: 'G', type: 'linear' as const, stops: [{ offset: 0, color: { model: 'rgb' as const, values: [0, 0, 0] }, opacity: 1 }, { offset: 1, color: { model: 'rgb' as const, values: [255, 255, 255] }, opacity: 1 }] };
    s.session.run(addSwatch(swatch));
    s.session.run(addGradient(gradient));
    const r = s.rect(0, 0);
    s.session.run({ label: 'paint', apply: (d) => void (d.spaces[0]!.layers[0]!.children[0] = { ...(d.spaces[0]!.layers[0]!.children[0] as Node), appearance: { items: [{ kind: 'fill', paint: { type: 'swatch', swatchId: 'sw1' }, opacity: 1, modifiers: [] }, { kind: 'stroke', paint: { type: 'linear', gradientId: 'gr1', transform: [1, 0, 0, 1, 0, 0] }, stroke: { width: 1, cap: 'butt', join: 'miter', miterLimit: 4, align: 'center', dash: null, dashAlignToCorners: false, arrowScale: [100, 100] }, opacity: 1, modifiers: [] }] } }) });
    const added = s.session.images.add(PNG)!;
    s.session.run(placeImage(s.space().id, s.layerId(), createImage(s.ids, added.hash, 64, 32), { width: 64, height: 32, format: 'png' }));
    const img = s.space().layers[0]!.children[1]!;

    const payload = copyObjects(s.session.document, s.space(), [r.id, img.id])!;
    expect(payload.swatches.map((x) => x.id)).toEqual(['sw1']);
    expect(payload.gradients.map((x) => x.id)).toEqual(['gr1']);
    expect(Object.keys(payload.images)).toEqual([added.hash]);

    const decoded = decodeClip(encodeClip(payload, s.session.images))!;
    expect(decoded.images[added.hash]).toEqual(PNG);

    const other = setup('b');
    for (const [hash, bytes] of Object.entries(decoded.images)) other.session.images.set(hash, bytes);
    paste(other, decoded.payload, 'center');
    const doc = other.session.document;
    expect(doc.resources.swatches.map((x) => x.id)).toEqual(['sw1']);
    expect(doc.resources.gradients.map((x) => x.id)).toEqual(['gr1']);
    expect(doc.resources.images[added.hash]).toBeDefined();
    expect(other.session.images.get(added.hash)).toEqual(PNG);
    other.session.undo();
    expect(other.session.document.resources.swatches).toHaveLength(0);
  });

  it('does not paste twice the resources the document already has', () => {
    const s = setup();
    const added = s.session.images.add(PNG)!;
    s.session.run(placeImage(s.space().id, s.layerId(), createImage(s.ids, added.hash, 64, 32), { width: 64, height: 32, format: 'png' }));
    const payload = copyObjects(s.session.document, s.space(), [s.space().layers[0]!.children[0]!.id])!;
    paste(s, payload, 'inPlace');
    expect(Object.keys(s.session.document.resources.images)).toEqual([added.hash]);
  });

  it('decodeClip refuses anything that is not a clip, without throwing', () => {
    expect(decodeClip(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(decodeClip(new TextEncoder().encode('hello'))).toBeNull();
    const s = setup();
    const a = s.rect(0, 0);
    const payload = copyObjects(s.session.document, s.space(), [a.id])!;
    const broken = { ...payload, nodes: [{ id: 'x', type: 'path' }] };
    expect(decodeClip(encodeClip(broken as unknown as typeof payload, new ImageStore()))).toBeNull();
    const wrongFormat = { ...payload, format: 'other' };
    expect(decodeClip(encodeClip(wrongFormat as unknown as typeof payload, new ImageStore()))).toBeNull();
  });
});

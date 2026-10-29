import { describe, expect, it } from 'vitest';
import {
  createDocument,
  createRect,
  documentFromDrawings,
  drawingPayload,
  DocumentSession,
  getActiveSpace,
  nodeWorldBounds,
  pasteCommand,
  readVict,
  selectOnly,
  sequentialIds,
  writeVict,
  type ImportedDrawing,
} from '..';

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 218, 99, 252, 207, 192, 80, 15, 0, 4, 133, 1, 128, 132, 169, 140, 33, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
const names = { name: 'Plano', space: (n: number) => `Espacio ${n}`, artboard: (n: number) => `Mesa ${n}`, layer: (n: number) => `Capa ${n}` };
const gradient = (id: string) => ({ id, name: id, type: 'linear' as const, stops: [{ offset: 0, color: { model: 'rgb' as const, values: [0, 0, 0] }, opacity: 1 }, { offset: 1, color: { model: 'rgb' as const, values: [255, 255, 255] }, opacity: 1 }] });

function drawing(ids: ReturnType<typeof sequentialIds>, width: number, height: number, withImage = false): ImportedDrawing {
  const rect = createRect(ids, 10, 10);
  rect.transform = [1, 0, 0, 1, 5, 5];
  return {
    width,
    height,
    nodes: [rect],
    gradients: [gradient(`g${width}`)],
    images: withImage ? { aaa: { resource: { width: 1, height: 1, format: 'png' }, bytes: PNG } } : {},
  };
}

describe('documentFromDrawings', () => {
  it('makes one Space per drawing, with an artboard of its size and a layer with its objects', () => {
    const ids = sequentialIds('n');
    const { document } = documentFromDrawings([drawing(ids, 200, 100), drawing(ids, 50, 80), drawing(ids, 10, 10)], names, ids, '2026-01-01T00:00:00.000Z');
    expect(document.meta.name).toBe('Plano');
    expect(document.spaces.map((s) => s.name)).toEqual(['Espacio 1', 'Espacio 2', 'Espacio 3']);
    expect(document.spaces.map((s) => [s.artboards[0]!.w, s.artboards[0]!.h])).toEqual([[200, 100], [50, 80], [10, 10]]);
    expect(document.spaces.every((s) => s.layers.length === 1 && s.layers[0]!.children.length === 1)).toBe(true);
    expect(document.activeSpaceId).toBe(document.spaces[0]!.id);
    expect(document.resources.gradients.map((g) => g.id)).toEqual(['g200', 'g50', 'g10']);
    // The Spaces are different objects with different ids.
    expect(new Set(document.spaces.flatMap((s) => [s.id, s.artboards[0]!.id, s.layers[0]!.id])).size).toBe(9);
  });

  it('keeps the image files with their resources, and the document survives a .vict round trip', () => {
    const ids = sequentialIds('n');
    const { document, images } = documentFromDrawings([drawing(ids, 100, 100, true)], names, ids, '2026-01-01T00:00:00.000Z');
    expect(document.resources.images.aaa).toEqual({ width: 1, height: 1, format: 'png' });
    expect(images.get('aaa')).toEqual(PNG);
    const back = readVict(writeVict({ document, app: 't', images: images.toRecord(Object.keys(document.resources.images)) }));
    expect(back.document.spaces[0]!.artboards[0]).toMatchObject({ w: 100, h: 100 });
    expect(back.images.aaa).toEqual(PNG);
  });

  it('an empty list still gives a usable document', () => {
    const ids = sequentialIds('n');
    const { document } = documentFromDrawings([], names, ids, '2026-01-01T00:00:00.000Z');
    expect(document.spaces).toHaveLength(1);
  });
});

describe('drawingPayload', () => {
  it('pastes as one group centred by the drawing frame, bringing its gradients and pictures', () => {
    const ids = sequentialIds('n');
    const target = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
    const session = new DocumentSession(target, { ids });
    const payload = drawingPayload(drawing(ids, 200, 100, true), 'logo.svg', ids);
    expect(payload.nodes).toHaveLength(1);
    expect(payload.nodes[0]).toMatchObject({ type: 'group', name: 'logo.svg' });
    const space = getActiveSpace(session.document);
    const result = pasteCommand(session.document, space, payload, ids, { mode: 'center', viewCenter: { x: 500, y: 400 }, selectedIds: [], layerId: space.layers[0]!.id })!;
    session.run(result.command, selectOnly(space.id, result.ids));
    expect(session.document.resources.gradients.map((g) => g.id)).toEqual(['g200']);
    expect(session.document.resources.images.aaa).toBeDefined();
    // The frame (0,0)-(200,100) is centred on (500,400): the rectangle inside it, at (5,5), lands at (405, 355).
    const placed = nodeWorldBounds(getActiveSpace(session.document), result.ids[0]!)!;
    expect(placed).toMatchObject({ minX: 405, minY: 355, maxX: 415, maxY: 365 });
  });
});

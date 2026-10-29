import { describe, expect, it } from 'vitest';
import {
  createDocument,
  createImage,
  DocumentSession,
  expandTrace,
  getActiveSpace,
  makeTrace,
  paramsForPreset,
  placeImage,
  readVict,
  retrace,
  sequentialIds,
  translation,
  traceImage,
  writeVict,
  type GroupNode,
} from '..';

function setup() {
  const ids = sequentialIds('t');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids, historyLimit: 50 });
  const space = () => getActiveSpace(session.document);
  const image = createImage(ids, 'pic', 100, 50, translation(10, 20));
  session.run(placeImage(space().id, space().layers[0]!.id, image, { width: 40, height: 20, format: 'png' }));
  const pixels = { width: 40, height: 20, data: Uint8ClampedArray.from({ length: 40 * 20 * 4 }, (_, i) => (i % 4 === 3 ? 255 : (Math.floor(i / 4) % 40 < 20 ? 0 : 255))) };
  return { ids, session, space, image, pixels };
}

describe('live trace', () => {
  it('replaces the image by a group at the same place, scaled to its box; undo brings the image back', () => {
    const { ids, session, space, image, pixels } = setup();
    const params = paramsForPreset('bw');
    const { command } = makeTrace(ids, space().id, image, params, traceImage(pixels, params));
    session.run(command);
    const group = space().layers[0]!.children[0] as GroupNode;
    expect(group.type).toBe('group');
    expect(group.transform).toEqual(translation(10, 20));
    expect(group.trace).toMatchObject({ resourceId: 'pic', width: 100, height: 50 });
    // The 40 x 20 px picture is drawn in the 100 x 50 box: its black half is 50 wide.
    const compound = group.children[0]!;
    expect(compound.type).toBe('compound');
    const xs = compound.type === 'compound' ? compound.children.flatMap((p) => p.anchors.map((a) => a.p.x)) : [];
    expect(Math.max(...xs)).toBeCloseTo(50, 6);
    session.undo();
    expect(space().layers[0]!.children[0]!.type).toBe('image');
  });

  it('tracing again swaps the paths; Expandir keeps them but ends the link; the file round-trips', () => {
    const { ids, session, space, image, pixels } = setup();
    const params = paramsForPreset('bw');
    session.run(makeTrace(ids, space().id, image, params, traceImage(pixels, params)).command);
    const group = () => space().layers[0]!.children[0] as GroupNode;
    const before = group().children.map((c) => c.id);
    const next = { ...params, threshold: 0 }; // nothing is darker than that: no paths
    session.run(retrace(ids, space().id, group(), next, traceImage(pixels, next)));
    expect(group().children).toHaveLength(0);
    expect(group().trace?.params.threshold).toBe(0);
    session.undo();
    expect(group().children.map((c) => c.id)).toEqual(before);

    session.run(expandTrace(space().id, group()));
    expect(group().trace).toBeUndefined();
    expect(group().children.length).toBeGreaterThan(0);

    session.undo();
    const reopened = readVict(writeVict({ document: session.document, app: 'test' })).document;
    expect((getActiveSpace(reopened).layers[0]!.children[0] as GroupNode).trace?.resourceId).toBe('pic');
  });
});

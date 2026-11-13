import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addNode, cornerAnchor, createCompound, createPath, pathFrameOf, withAnchors, type PathNode, createDocument, createRect, DocumentSession, getActiveSpace, nodeWorldBounds, patchStroke, primaryItem, selectOnly, sequentialIds, translation, worldRotationOf, type ShapeNode } from '../../core';

let current: { session: DocumentSession } | null = null;
vi.mock('../documents', () => ({
  manager: {
    get active() {
      return current;
    },
  },
}));
vi.mock('../documents/manager', () => ({ lastSelectionOf: () => undefined }));

const actions = await import('./transformActions');
const { useUi } = await import('./store');

const ids = sequentialIds('t');
let session: DocumentSession;
let rect: ShapeNode;

beforeEach(() => {
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  session = new DocumentSession(doc, { ids, historyLimit: 100 });
  current = { session };
  const space = getActiveSpace(session.document);
  rect = createRect(ids, 100, 50);
  rect.transform = translation(10, 20);
  session.run(addNode(space.id, space.layers[0]!.id, rect));
  session.select(selectOnly(space.id, [rect.id]));
  useUi.setState({ referencePoint: { x: 0, y: 0 }, linkProportions: false, scaleStrokes: false });
});

const bounds = () => nodeWorldBounds(getActiveSpace(session.document), rect.id)!;
const strokeWidth = () => {
  const node = getActiveSpace(session.document).layers[0]!.children[0] as ShapeNode;
  const item = primaryItem(node.appearance, 'stroke');
  return item && item.kind === 'stroke' ? item.stroke.width : NaN;
};

describe('transform actions (control bar and Transform panel)', () => {
  it('moves the reference point to an absolute position', () => {
    actions.moveSelectionTo('x', 40);
    actions.moveSelectionTo('y', 5);
    expect(bounds()).toMatchObject({ minX: 40, minY: 5, maxX: 140, maxY: 55 });
  });

  it('uses the chosen reference point', () => {
    useUi.setState({ referencePoint: { x: 0.5, y: 0.5 } });
    actions.moveSelectionTo('x', 0);
    expect(bounds().minX).toBe(-50);
  });

  it('resizes around the reference point, proportionally when linked', () => {
    actions.resizeSelection('x', 200);
    expect(bounds()).toMatchObject({ minX: 10, minY: 20, maxX: 210, maxY: 70 });
    useUi.setState({ linkProportions: true });
    actions.resizeSelection('y', 100);
    expect(bounds().maxX - bounds().minX).toBeCloseTo(400, 6);
    actions.resizeSelection('x', 0); // ignored
    expect(bounds().maxX - bounds().minX).toBeCloseTo(400, 6);
  });

  it('scales stroke weights with the object only when "escalar trazos" is on', () => {
    actions.resizeSelection('x', 200);
    expect(strokeWidth()).toBe(1);
    useUi.setState({ linkProportions: true, scaleStrokes: true });
    const before = session.historyLength;
    actions.resizeSelection('x', 400); // factor 2
    expect(strokeWidth()).toBe(2);
    expect(session.historyLength).toBe(before + 1); // one undo step for both
    session.undo();
    expect(strokeWidth()).toBe(1);
    session.run(patchStroke(getActiveSpace(session.document).id, [rect.id], { dash: [4, 2] }));
    actions.resizeSelection('x', 100);
    const node = getActiveSpace(session.document).layers[0]!.children[0] as ShapeNode;
    expect((primaryItem(node.appearance, 'stroke') as { stroke: { dash: number[] } }).stroke.dash[0]).toBeCloseTo(2, 9);
  });

  it('rotates counter-clockwise around the centre, shears and flips', () => {
    actions.rotateSelection(90);
    const space = getActiveSpace(session.document);
    expect(worldRotationOf(space, rect.id)).toBeCloseTo(-Math.PI / 2, 9);
    const b = bounds();
    expect(b.maxX - b.minX).toBeCloseTo(50, 6);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(60, 6);

    actions.rotateSelection(-90);
    actions.shearSelection(45);
    const sheared = bounds();
    expect(sheared.maxX - sheared.minX).toBeCloseTo(150, 6); // 100 wide + 50 slant

    actions.shearSelection(-45);
    const x = bounds().minX;
    actions.flipSelection('h');
    expect(bounds().minX).toBeCloseTo(x, 6); // mirrored in place
    expect((getActiveSpace(session.document).layers[0]!.children[0] as ShapeNode).transform[0]).toBeCloseTo(-1, 9);
  });

  it('does nothing without a selection', () => {
    session.select(selectOnly(getActiveSpace(session.document).id, []));
    const before = session.historyLength;
    actions.moveSelectionTo('x', 5);
    actions.rotateSelection(30);
    actions.flipSelection('v');
    expect(session.historyLength).toBe(before);
  });
});

describe('transform actions on the picked sub-paths of an isolated compound path', () => {
  it('a flip turns only the picked sub-path, across its own centre; the X field moves it alone', () => {
    const space = getActiveSpace(session.document);
    const tri = (x: number) => createPath(ids, [cornerAnchor({ x, y: 0 }), cornerAnchor({ x: x + 40, y: 0 }), cornerAnchor({ x, y: 20 })], true) as PathNode;
    const one = tri(0);
    const two = tri(100);
    const compound = createCompound(ids, [one, two]);
    compound.transform = translation(0, 300);
    session.run(addNode(space.id, space.layers[0]!.id, compound));
    useUi.setState({ isolation: { [space.id]: compound.id } });
    session.select(withAnchors(selectOnly(space.id, [compound.id]), { [two.id]: [0, 1, 2] }));
    const anchors = (id: string) => pathFrameOf(getActiveSpace(session.document), id)!.path.anchors.map((a) => ({ x: +a.p.x.toFixed(9) + 0, y: +a.p.y.toFixed(9) + 0 }));

    actions.flipSelection('h'); // mirrored left ↔ right inside its box 100…140
    expect(anchors(two.id)).toEqual([{ x: 140, y: 0 }, { x: 100, y: 0 }, { x: 140, y: 20 }]);
    expect(anchors(one.id)).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 20 }]);
    session.undo();
    expect(anchors(two.id)).toEqual([{ x: 100, y: 0 }, { x: 140, y: 0 }, { x: 100, y: 20 }]);

    actions.moveSelectionTo('x', 200); // reference point top-left: the sub-path box, not the compound's
    expect(anchors(two.id)[0]).toEqual({ x: 200, y: 0 });
    expect(anchors(one.id)[0]).toEqual({ x: 0, y: 0 });
    useUi.setState({ isolation: {} });
  });
});

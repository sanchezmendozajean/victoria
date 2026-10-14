import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addNode, createDocument, createRect, DocumentSession, getActiveSpace, nodeWorldBounds, patchStroke, primaryItem, selectOnly, sequentialIds, translation, worldRotationOf, type ShapeNode } from '../../core';

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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addNode,
  createDocument,
  createPath,
  createRect,
  DocumentSession,
  getActiveSpace,
  cornerAnchor,
  selectOnly,
  sequentialIds,
  withAnchors,
  type Anchor,
  type PathNode,
} from '../../core';

let current: { session: DocumentSession } | null = null;
vi.mock('../documents', () => ({
  manager: {
    get active() {
      return current;
    },
  },
}));
vi.mock('../documents/manager', () => ({ lastSelectionOf: () => undefined }));

const actions = await import('./pathActions');
const selection = await import('./selectionActions');

const ids = sequentialIds('a');
let session: DocumentSession;

beforeEach(() => {
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  session = new DocumentSession(doc, { ids, historyLimit: 100 });
  current = { session };
});

const space = () => getActiveSpace(session.document);
const layerId = () => space().layers[0]!.id;
const children = () => space().layers[0]!.children;
const paths = (): PathNode[] => children().filter((c) => c.type === 'path') as PathNode[];
const pts = (...list: Array<[number, number]>): Anchor[] => list.map(([x, y]) => cornerAnchor({ x, y }));
const addPath = (anchors: Anchor[], closed = false): PathNode => {
  const node = createPath(ids, anchors, closed);
  session.run(addNode(space().id, layerId(), node));
  return node;
};
const pick = (pathId: string, indices: number[], extra: string[] = []) => {
  session.select(withAnchors(selectOnly(space().id, [pathId, ...extra]), { [pathId]: indices }));
};

describe('Delete with picked anchors', () => {
  it('removes only the anchors (one undo step) and keeps the path selected', () => {
    const p = addPath(pts([0, 0], [10, 0], [20, 0], [30, 0]));
    pick(p.id, [1, 2]);
    const before = session.historyLength;
    selection.deleteSelection();
    expect(paths()[0]!.anchors.map((a) => a.p.x)).toEqual([0, 30]);
    expect(session.historyLength).toBe(before + 1);
    expect(session.selection.ids).toEqual([p.id]);
    expect(session.selection.anchors).toBeUndefined();
    session.undo();
    expect(paths()[0]!.anchors).toHaveLength(4);
  });

  it('removes the path when fewer than two anchors would remain', () => {
    const p = addPath(pts([0, 0], [10, 0]));
    pick(p.id, [0]);
    selection.deleteSelection();
    expect(paths()).toHaveLength(0);
    expect(session.selection.ids).toEqual([]);
  });

  it('deleting anchors of a live shape converts it first', () => {
    const r = createRect(ids, 100, 100);
    session.run(addNode(space().id, layerId(), r));
    session.select(withAnchors(selectOnly(space().id, [r.id]), { [r.id]: [2] }));
    selection.deleteSelection();
    const node = children()[0] as PathNode;
    expect(node.type).toBe('path');
    expect(node.anchors).toHaveLength(3);
  });

  it('without anchors it deletes the objects as before', () => {
    const p = addPath(pts([0, 0], [10, 0]));
    session.select(selectOnly(space().id, [p.id]));
    selection.deleteSelection();
    expect(children()).toHaveLength(0);
  });
});

describe('convert and cut at anchors', () => {
  it('converts the picked anchors to smooth and back to corner', () => {
    const p = addPath(pts([0, 0], [100, 0], [200, 50]));
    pick(p.id, [1]);
    actions.convertSelectedAnchors('smooth');
    expect(paths()[0]!.anchors[1]!.kind).toBe('smooth');
    expect(paths()[0]!.anchors[1]!.out).not.toBeNull();
    actions.convertSelectedAnchors('corner');
    expect(paths()[0]!.anchors[1]!.kind).toBe('corner');
    expect(paths()[0]!.anchors[1]!.out).toBeNull();
  });

  it('cuts a path at several anchors into pieces with coincident ends', () => {
    const p = addPath(pts([0, 0], [10, 0], [20, 0], [30, 0], [40, 0]));
    pick(p.id, [1, 3]);
    actions.cutAtSelectedAnchors();
    const list = paths();
    expect(list).toHaveLength(3);
    expect(list.map((x) => x.anchors.map((a) => a.p.x))).toEqual([
      [0, 10],
      [10, 20, 30],
      [30, 40],
    ]);
    expect(new Set(list.map((x) => x.id)).size).toBe(3);
  });

  it('cutting a closed path at one anchor opens it', () => {
    const p = addPath(pts([0, 0], [10, 0], [10, 10]), true);
    pick(p.id, [1]);
    actions.cutAtSelectedAnchors();
    expect(paths()).toHaveLength(1);
    expect(paths()[0]!.closed).toBe(false);
    expect(paths()[0]!.anchors).toHaveLength(4);
  });
});

describe('Join (Ctrl+J)', () => {
  it('closes a single selected open path', () => {
    const p = addPath(pts([0, 0], [10, 0], [10, 10]));
    session.select(selectOnly(space().id, [p.id]));
    actions.joinSelection();
    expect(paths()[0]!.closed).toBe(true);
  });

  it('joins two picked end anchors of different paths', () => {
    const a = addPath(pts([0, 0], [10, 0]));
    const b = addPath(pts([50, 0], [20, 0]));
    session.select({ spaceId: space().id, ids: [a.id, b.id], anchors: { [a.id]: [1], [b.id]: [1] } });
    actions.joinSelection();
    expect(paths()).toHaveLength(1);
    expect(paths()[0]!.id).toBe(a.id);
    expect(paths()[0]!.anchors.map((x) => x.p.x)).toEqual([0, 10, 20, 50]);
  });

  it('closes a path whose two end anchors are picked', () => {
    const p = addPath(pts([0, 0], [10, 0], [10, 10]));
    pick(p.id, [0, 2]);
    actions.joinSelection();
    expect(paths()[0]!.closed).toBe(true);
    expect(paths()[0]!.anchors).toHaveLength(3);
  });

  it('chains several selected open paths by their nearest ends', () => {
    const a = addPath(pts([0, 0], [10, 0]));
    const b = addPath(pts([100, 0], [90, 0]));
    const c = addPath(pts([20, 0], [50, 0]));
    session.select(selectOnly(space().id, [a.id, b.id, c.id]));
    const before = session.historyLength;
    actions.joinSelection();
    expect(session.historyLength).toBe(before + 1);
    expect(paths()).toHaveLength(1);
    expect(paths()[0]!.anchors.map((x) => x.p.x)).toEqual([0, 10, 20, 50, 90, 100]);
  });

  it('does nothing for closed paths', () => {
    const p = addPath(pts([0, 0], [10, 0], [10, 10]), true);
    session.select(selectOnly(space().id, [p.id]));
    const before = session.historyLength;
    actions.joinSelection();
    expect(session.historyLength).toBe(before);
  });
});

describe('Average (Alt+Ctrl+J)', () => {
  it('aligns the picked anchors on both axes, or on a single one', () => {
    const p = addPath(pts([0, 0], [10, 20], [40, 10]));
    pick(p.id, [0, 1, 2]);
    actions.averageAnchorsOf(actions.selectedAnchorTargets(), 'horizontal'); // same Y
    expect(paths()[0]!.anchors.map((a) => a.p.y)).toEqual([10, 10, 10]);
    expect(paths()[0]!.anchors.map((a) => a.p.x)).toEqual([0, 10, 40]);
    actions.averageAnchorsOf(actions.selectedAnchorTargets(), 'both');
    expect(paths()[0]!.anchors.map((a) => a.p)).toEqual([
      { x: 50 / 3, y: 10 },
      { x: 50 / 3, y: 10 },
      { x: 50 / 3, y: 10 },
    ]);
  });

  it('moves the handles together with their anchors', () => {
    const anchors: Anchor[] = [
      { p: { x: 0, y: 0 }, in: null, out: { x: 10, y: 0 }, kind: 'corner' },
      { p: { x: 100, y: 50 }, in: { x: 90, y: 50 }, out: null, kind: 'corner' },
    ];
    const p = addPath(anchors);
    pick(p.id, [0, 1]);
    actions.averageAnchorsOf(actions.selectedAnchorTargets(), 'horizontal');
    expect(paths()[0]!.anchors[0]!.p.y).toBe(25);
    expect(paths()[0]!.anchors[0]!.out).toEqual({ x: 10, y: 25 });
  });
});

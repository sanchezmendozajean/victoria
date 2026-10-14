import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addNode, createDocument, createRect, DocumentSession, getActiveSpace, nodeWorldBounds, selectOnly, sequentialIds, translation, type Node } from '../../core';

let current: { session: DocumentSession } | null = null;
vi.mock('../documents', () => ({
  manager: {
    get active() {
      return current;
    },
  },
}));
vi.mock('../documents/manager', () => ({ lastSelectionOf: () => undefined }));

const layout = await import('./layoutActions');
const { useUi } = await import('./store');

const ids = sequentialIds('l');
let session: DocumentSession;

beforeEach(() => {
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  session = new DocumentSession(doc, { ids, historyLimit: 100 });
  current = { session };
  useUi.setState({ alignTo: 'selection', keyObject: null, alignPreviewBounds: false, activeArtboard: {} });
});

const space = () => getActiveSpace(session.document);
const layerId = () => space().layers[0]!.id;
const rect = (x: number, y: number, w: number, h: number) => {
  const r = createRect(ids, w, h);
  r.transform = translation(x, y);
  session.run(addNode(space().id, layerId(), r));
  return r;
};
const x = (n: Node) => nodeWorldBounds(space(), n.id)!.minX;
const y = (n: Node) => nodeWorldBounds(space(), n.id)!.minY;
const select = (...nodes: Node[]) => session.select(selectOnly(space().id, nodes.map((n) => n.id)));

describe('align and distribute actions', () => {
  it('aligns to the selection, in one undo step', () => {
    const a = rect(0, 0, 10, 10);
    const b = rect(50, 20, 30, 10);
    const c = rect(100, 40, 20, 10);
    select(a, b, c);
    const before = session.historyLength;
    layout.alignSelection('left');
    expect([x(a), x(b), x(c)]).toEqual([0, 0, 0]);
    expect(session.historyLength).toBe(before + 1);
    session.undo();
    expect(x(b)).toBe(50);
  });

  it('with a single object it does nothing, unless it aligns to the artboard', () => {
    const a = rect(50, 50, 10, 10);
    select(a);
    layout.alignSelection('left');
    expect(x(a)).toBe(50);
    useUi.setState({ alignTo: 'artboard' });
    layout.alignSelection('left');
    expect(x(a)).toBe(0);
    layout.alignSelection('hcenter');
    expect(x(a)).toBeCloseTo(space().artboards[0]!.w / 2 - 5, 6);
  });

  it('aligns to the key object', () => {
    const a = rect(0, 0, 10, 10);
    const b = rect(70, 0, 10, 10);
    const c = rect(30, 0, 10, 10);
    select(a, b, c);
    useUi.setState({ alignTo: 'key', keyObject: c.id });
    layout.alignSelection('right');
    expect([x(a), x(b), x(c)]).toEqual([30, 30, 30]);
  });

  it('uses preview bounds (strokes included) when asked', () => {
    const a = rect(0, 0, 10, 10); // 1 pt stroke → preview bounds start at −0.5
    const b = rect(50, 0, 10, 10);
    select(a, b);
    useUi.setState({ alignPreviewBounds: true });
    layout.alignSelection('left');
    expect(x(b)).toBe(0); // geometric position (the stroke is the same on both)
  });

  it('distributes by an edge and by exact spacing', () => {
    const a = rect(0, 0, 10, 10);
    const b = rect(15, 0, 10, 10);
    const c = rect(100, 0, 10, 10);
    select(a, b, c);
    layout.distributeSelection('left');
    expect(x(b)).toBe(50);
    layout.spaceSelection('h', 5);
    expect([x(a), x(b), x(c)]).toEqual([0, 15, 30]);
    layout.spaceSelection('h', null); // auto keeps the outermost
    expect([x(a), x(c)]).toEqual([0, 30]);
  });

  it('arranges in a grid and fits to the artboard with margins', () => {
    const items = [rect(0, 0, 10, 10), rect(100, 5, 10, 10), rect(30, 90, 10, 10), rect(60, 95, 10, 10)];
    select(...items);
    layout.gridSelection({ columns: 2, gapX: 5, gapY: 5 });
    expect(items.map((n) => [x(n), y(n)])).toEqual([
      [0, 0],
      [15, 0],
      [0, 15],
      [15, 15],
    ]);
    layout.fitSelectionToArtboard({ top: 20, right: 20, bottom: 20, left: 20 });
    const board = space().artboards[0]!;
    const minX = Math.min(...items.map(x));
    const maxX = Math.max(...items.map((n) => nodeWorldBounds(space(), n.id)!.maxX));
    expect(minX).toBeCloseTo(board.x + 20, 6);
    expect(maxX).toBeCloseTo(board.x + board.w - 20, 6);
  });

  it('does nothing without a document or selection', () => {
    current = null;
    expect(() => layout.alignSelection('left')).not.toThrow();
    current = { session };
    session.select(selectOnly(space().id, []));
    const before = session.historyLength;
    layout.distributeSelection('left');
    expect(session.historyLength).toBe(before);
  });
});

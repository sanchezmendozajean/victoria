import { describe, expect, it } from 'vitest';
import { pathFrameOf, pointOnSegment, segmentsOf, type Anchor, type PathNode } from '../../../core';
import { createDirectSelectionTool } from '../directSelectionTool';
import { createLassoTool } from '../lassoTool';
import { click, createTestHost, drag, ev, selectedIds, type TestHost } from './fakeHost';

const corner = (x: number, y: number, inn: [number, number] | null = null, out: [number, number] | null = null): Anchor => ({
  p: { x, y },
  in: inn && { x: inn[0], y: inn[1] },
  out: out && { x: out[0], y: out[1] },
  kind: 'corner',
});
const smooth = (x: number, y: number, inn: [number, number], out: [number, number]): Anchor => ({ ...corner(x, y, inn, out), kind: 'smooth' });

const setup = (init?: Parameters<typeof createTestHost>[0]) => ({ t: createTestHost(init), tool: createDirectSelectionTool() });
const anchorsOf = (t: TestHost, id: string): Anchor[] => pathFrameOf(t.space(), id)!.path.anchors;
const picked = (t: TestHost, id: string): number[] => t.session.selection.anchors?.[id] ?? [];
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

/** A closed square path with a fill. */
const square = (t: TestHost, x = 100, y = 100, size = 100) => t.path([corner(x, y), corner(x + size, y), corner(x + size, y + size), corner(x, y + size)]);

describe('Direct Selection · picking (specs/03 · Selección directa)', () => {
  it('a click on an object selects it and shows its anchors without selecting any', () => {
    const { t, tool } = setup();
    const p = square(t);
    click(tool, t, 150, 150);
    expect(selectedIds(t)).toEqual([p.id]);
    expect(t.session.selection.anchors).toBeUndefined();
  });

  it('a click on an anchor selects that anchor; Shift adds; a click on empty space clears everything', () => {
    const { t, tool } = setup();
    const p = square(t);
    click(tool, t, 150, 150);
    click(tool, t, 100, 100);
    expect(picked(t, p.id)).toEqual([0]);
    click(tool, t, 200, 200, { shiftKey: true });
    expect(picked(t, p.id)).toEqual([0, 2]);
    click(tool, t, 200, 200, { shiftKey: true });
    expect(picked(t, p.id)).toEqual([0]);
    click(tool, t, 600, 600);
    expect(selectedIds(t)).toEqual([]);
    expect(t.session.selection.anchors).toBeUndefined();
  });

  it('a click on a segment selects the segment (both of its anchors)', () => {
    const { t, tool } = setup();
    const p = square(t);
    click(tool, t, 150, 150);
    click(tool, t, 150, 100); // top edge
    expect(picked(t, p.id)).toEqual([0, 1]);
    click(tool, t, 100, 150); // left edge: the closing segment from anchor 3 to 0
    expect(picked(t, p.id)).toEqual([0, 3]);
  });

  it('picks the leaf of a group, not the group', () => {
    const { t, tool } = setup();
    const inner = t.newRect(0, 0, 50, 50);
    const g = t.group([inner]);
    click(tool, t, 25, 25);
    expect(selectedIds(t)).toEqual([inner.id]);
    expect(selectedIds(t)).not.toContain(g.id);
  });
});

describe('Direct Selection · moving anchors', () => {
  it('dragging an anchor moves only it, with its handles, as one undo step', () => {
    const { t, tool } = setup();
    const p = t.path([corner(0, 0), smooth(100, 0, [80, 0], [120, 0]), corner(200, 0)], false);
    click(tool, t, 100, 0, { clickCount: 1 }); // selects the path (stroke) …
    click(tool, t, 100, 0); // … then the anchor
    expect(picked(t, p.id)).toEqual([1]);
    const before = t.session.historyLength;
    drag(tool, t, { x: 100, y: 0 }, { x: 110, y: 30 });
    const a = anchorsOf(t, p.id)[1]!;
    expect(a.p).toEqual({ x: 110, y: 30 });
    expect(a.in).toEqual({ x: 90, y: 30 });
    expect(a.out).toEqual({ x: 130, y: 30 });
    expect(anchorsOf(t, p.id)[0]!.p).toEqual({ x: 0, y: 0 });
    expect(t.session.historyLength).toBe(before + 1);
    t.session.undo();
    expect(anchorsOf(t, p.id)[1]!.p).toEqual({ x: 100, y: 0 });
  });

  it('moves every selected anchor together, in several paths', () => {
    const { t, tool } = setup();
    const a = square(t, 0, 0, 100);
    const b = square(t, 300, 0, 100);
    click(tool, t, 50, 50);
    click(tool, t, 350, 50, { shiftKey: true }); // two objects selected
    click(tool, t, 0, 0); // anchor 0 of a
    click(tool, t, 300, 0, { shiftKey: true }); // anchor 0 of b
    drag(tool, t, { x: 0, y: 0 }, { x: 10, y: 20 });
    expect(anchorsOf(t, a.id)[0]!.p).toEqual({ x: 10, y: 20 });
    expect(anchorsOf(t, b.id)[0]!.p).toEqual({ x: 310, y: 20 });
    expect(anchorsOf(t, a.id)[1]!.p).toEqual({ x: 100, y: 0 });
  });

  it('Shift constrains the move to 45°', () => {
    const { t, tool } = setup();
    const p = square(t, 0, 0, 100);
    click(tool, t, 50, 50);
    click(tool, t, 0, 0);
    drag(tool, t, { x: 0, y: 0 }, { x: 50, y: 8 }, { shiftKey: true });
    expect(anchorsOf(t, p.id)[0]!.p.y).toBeCloseTo(0, 9);
  });

  it('follows the owner transform: a transformed path is edited in its own space', () => {
    const { t, tool } = setup();
    const p = square(t, 0, 0, 100);
    t.session.run({ label: 'node.props', spaceId: t.spaceId(), apply: (d) => void ((d.spaces[0]!.layers[0]!.children[0] as { transform: number[] }).transform = [2, 0, 0, 2, 50, 50]) });
    click(tool, t, 150, 150); // inside (world 50..250)
    click(tool, t, 50, 50); // anchor 0 at world (50,50)
    drag(tool, t, { x: 50, y: 50 }, { x: 70, y: 90 });
    const a = anchorsOf(t, p.id)[0]!;
    expect(a.p.x).toBeCloseTo(10, 9); // 20 world px = 10 local units at scale 2
    expect(a.p.y).toBeCloseTo(20, 9);
  });

  it('Escape during the drag restores the anchors', () => {
    const { t, tool } = setup();
    const p = square(t, 0, 0, 100);
    click(tool, t, 50, 50);
    click(tool, t, 0, 0);
    const before = t.session.historyLength;
    tool.onPointerDown(ev(0, 0), t.host);
    tool.onPointerMove(ev(30, 30), t.host);
    tool.onPointerMove(ev(40, 40), t.host);
    expect(anchorsOf(t, p.id)[0]!.p.x).toBe(40);
    tool.onKey?.('Escape', t.host);
    expect(anchorsOf(t, p.id)[0]!.p.x).toBe(0);
    expect(t.session.historyLength).toBe(before);
  });

  it('moves selected anchors with the arrow keys (Shift = 10 pt) and objects when no anchor is selected', () => {
    const { t, tool } = setup();
    const p = square(t, 0, 0, 100);
    const key = (k: string, extra: object = {}) => ({ key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...extra });
    click(tool, t, 50, 50);
    expect(tool.onKeyDown?.(key('ArrowRight'), t.host)).toBe(true); // no anchor: moves the object
    expect((t.space().layers[0]!.children[0] as { transform: number[] }).transform[4]).toBe(1);
    click(tool, t, 100, 0); // anchor 1 of the (moved) path at world (101, 0)
    click(tool, t, 101, 0);
    expect(picked(t, p.id)).toEqual([1]);
    tool.onKeyDown?.(key('ArrowDown', { shiftKey: true }), t.host);
    expect(anchorsOf(t, p.id)[1]!.p.y).toBe(10);
    expect(anchorsOf(t, p.id)[0]!.p.y).toBe(0);
  });
});

describe('Direct Selection · handles (the rules of specs/03)', () => {
  const smoothPath = (t: TestHost) => t.path([corner(0, 100), smooth(100, 100, [60, 100], [140, 100]), corner(200, 100)], false);

  it('dragging a handle of a smooth anchor turns the opposite one to stay collinear, keeping its length', () => {
    const { t, tool } = setup();
    const p = smoothPath(t);
    click(tool, t, 100, 100);
    click(tool, t, 100, 100);
    drag(tool, t, { x: 140, y: 100 }, { x: 100, y: 160 });
    const a = anchorsOf(t, p.id)[1]!;
    expect(a.out).toEqual({ x: 100, y: 160 });
    expect(a.in!.x).toBeCloseTo(100, 9);
    expect(a.in!.y).toBeCloseTo(60, 9); // 40 long, opposite direction
    expect(a.kind).toBe('smooth');
  });

  it('Alt+drag breaks the symmetry and makes the anchor a corner', () => {
    const { t, tool } = setup();
    const p = smoothPath(t);
    click(tool, t, 100, 100);
    click(tool, t, 100, 100);
    drag(tool, t, { x: 140, y: 100 }, { x: 100, y: 160 }, { altKey: true });
    const a = anchorsOf(t, p.id)[1]!;
    expect(a.in).toEqual({ x: 60, y: 100 });
    expect(a.kind).toBe('corner');
  });

  it('Shift constrains the handle angle to 45°', () => {
    const { t, tool } = setup();
    const p = smoothPath(t);
    click(tool, t, 100, 100);
    click(tool, t, 100, 100);
    drag(tool, t, { x: 140, y: 100 }, { x: 180, y: 108 }, { shiftKey: true });
    expect(anchorsOf(t, p.id)[1]!.out!.y).toBeCloseTo(100, 9);
  });

  it('shows the handles of the selected anchor and of its neighbours on the touching segments', () => {
    const { t, tool } = setup();
    const p = t.path([corner(0, 0, null, [0, 50]), smooth(100, 0, [100, 50], [150, 0]), corner(200, 0, [200, 50], null)], false);
    click(tool, t, 100, 0);
    click(tool, t, 100, 0);
    expect(picked(t, p.id)).toEqual([1]);
    // The neighbour's handle toward the selected anchor is draggable even though its anchor is not selected.
    drag(tool, t, { x: 0, y: 50 }, { x: 0, y: 80 });
    expect(anchorsOf(t, p.id)[0]!.out).toEqual({ x: 0, y: 80 });
  });
});

describe('Direct Selection · reshaping a segment', () => {
  const curve = (t: TestHost) => t.path([smooth(0, 0, [-30, 0], [0, 100]), smooth(100, 0, [100, 100], [130, 0])], false, false);

  it('dragging a curved segment moves the curve point under the cursor with it', () => {
    const { t, tool } = setup();
    const p = curve(t);
    click(tool, t, 50, 75); // the curve at t = 0.5
    expect(picked(t, p.id)).toEqual([0, 1]);
    const before = segmentsOf({ anchors: anchorsOf(t, p.id), closed: false })[0]!;
    const start = pointOnSegment(before, 0.5);
    const historyBefore = t.session.historyLength;
    drag(tool, t, { x: 50, y: 75 }, { x: 50, y: 95 });
    const after = segmentsOf({ anchors: anchorsOf(t, p.id), closed: false })[0]!;
    const moved = pointOnSegment(after, 0.5);
    expect(moved.x - start.x).toBeCloseTo(0, 1);
    expect(moved.y - start.y).toBeCloseTo(20, 0);
    expect(anchorsOf(t, p.id)[0]!.p).toEqual({ x: 0, y: 0 }); // the anchors stay
    expect(t.session.historyLength).toBe(historyBefore + 1);
  });

  it('dragging a straight segment moves both of its anchors', () => {
    const { t, tool } = setup();
    const p = square(t, 0, 0, 100);
    click(tool, t, 50, 50);
    drag(tool, t, { x: 50, y: 0 }, { x: 50, y: -20 }); // top edge
    expect(anchorsOf(t, p.id).map((a) => a.p.y)).toEqual([-20, -20, 100, 100]);
  });
});

describe('Direct Selection · marquee', () => {
  it('selects the anchors inside, in any visible path, and the objects that own them', () => {
    const { t, tool } = setup();
    const a = square(t, 0, 0, 100);
    const b = square(t, 300, 0, 100);
    drag(tool, t, { x: -10, y: -10 }, { x: 350, y: 110 });
    expect(selectedIds(t).sort()).toEqual([a.id, b.id].sort());
    expect(picked(t, a.id)).toEqual([0, 1, 2, 3]);
    expect(picked(t, b.id)).toEqual([0, 3]); // x ≥ 300 and ≤ 350 → anchors at x = 300
  });

  it('Shift adds to the current anchors', () => {
    const { t, tool } = setup();
    const a = square(t, 0, 0, 100);
    const b = square(t, 300, 0, 100);
    drag(tool, t, { x: -10, y: -10 }, { x: 110, y: 110 });
    drag(tool, t, { x: 390, y: -10 }, { x: 410, y: 110 }, { shiftKey: true });
    expect(picked(t, a.id)).toEqual([0, 1, 2, 3]);
    expect(picked(t, b.id)).toEqual([1, 2]);
  });

  it('a marquee around nothing clears the selection', () => {
    const { t, tool } = setup();
    square(t, 0, 0, 100);
    click(tool, t, 50, 50);
    drag(tool, t, { x: 500, y: 500 }, { x: 600, y: 600 });
    expect(selectedIds(t)).toEqual([]);
  });
});

describe('Direct Selection · live shapes (convert on edit)', () => {
  it('editing a node of a live shape asks first; Cancel changes nothing', async () => {
    const { t, tool } = setup({ confirmAnswer: 'cancel' });
    const r = t.rect(0, 0, 100, 100);
    click(tool, t, 50, 50);
    click(tool, t, 0, 0);
    const before = t.session.historyLength;
    tool.onPointerDown(ev(0, 0), t.host);
    tool.onPointerMove(ev(20, 20), t.host);
    await flush();
    tool.onPointerUp(ev(20, 20), t.host);
    expect(t.host.confirm).toHaveBeenCalledTimes(1);
    expect(t.space().layers[0]!.children[0]!.type).toBe('shape');
    expect(t.session.historyLength).toBe(before);
    expect(picked(t, r.id)).toEqual([0]);
  });

  it('Convert turns the shape into a path, keeps editing, and is one undo step', async () => {
    const { t, tool } = setup({ confirmAnswer: 'convert' });
    const r = t.rect(0, 0, 100, 100);
    click(tool, t, 50, 50);
    click(tool, t, 0, 0);
    const before = t.session.historyLength;
    tool.onPointerDown(ev(0, 0), t.host);
    tool.onPointerMove(ev(20, 20), t.host);
    await flush();
    tool.onPointerMove(ev(30, 40), t.host);
    tool.onPointerUp(ev(30, 40), t.host);
    const node = t.space().layers[0]!.children[0] as PathNode;
    expect(node.type).toBe('path');
    expect(node.id).toBe(r.id);
    expect(node.anchors[0]!.p).toEqual({ x: 30, y: 40 });
    expect(t.session.historyLength).toBe(before + 1);
    t.session.undo();
    expect(t.space().layers[0]!.children[0]!.type).toBe('shape');
  });

  it('shows a rectangle node as read-only until conversion (anchors are picked on the virtual contour)', () => {
    const { t, tool } = setup();
    const r = t.rect(0, 0, 100, 100);
    click(tool, t, 50, 50);
    click(tool, t, 100, 100);
    expect(picked(t, r.id)).toEqual([2]);
  });
});

describe('Lasso', () => {
  it('selects the anchors inside the loop; Shift adds; a click clears', () => {
    const t = createTestHost();
    const tool = createLassoTool();
    const a = square(t, 0, 0, 100);
    const b = square(t, 300, 0, 100);
    const loop = (pts: Array<[number, number]>, extra = {}) => {
      tool.onPointerDown(ev(pts[0]![0], pts[0]![1], extra), t.host);
      for (const [x, y] of pts.slice(1)) tool.onPointerMove(ev(x, y, extra), t.host);
      tool.onPointerUp(ev(pts[0]![0], pts[0]![1], extra), t.host);
    };
    loop([[-20, -20], [120, -20], [120, 120], [-20, 120]]);
    expect(selectedIds(t)).toEqual([a.id]);
    expect(picked(t, a.id)).toEqual([0, 1, 2, 3]);

    loop([[290, -20], [410, -20], [410, 50], [290, 50]], { shiftKey: true });
    expect(picked(t, b.id)).toEqual([0, 1]);
    expect(picked(t, a.id)).toEqual([0, 1, 2, 3]);

    click(tool, t, 600, 600); // a click (no loop) clears
    expect(selectedIds(t)).toEqual([]);
  });

  it('draws the loop while dragging and nothing afterwards', () => {
    const t = createTestHost();
    const tool = createLassoTool();
    const moves: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, { get: (_t, k) => (k === 'lineTo' || k === 'moveTo' ? () => moves.push(String(k)) : () => undefined), set: () => true });
    tool.drawOverlay?.(ctx as never, t.host, { accent: '#00f' } as never);
    expect(moves).toEqual([]);
    tool.onPointerDown(ev(0, 0), t.host);
    tool.onPointerMove(ev(40, 0), t.host);
    tool.onPointerMove(ev(40, 40), t.host);
    tool.drawOverlay?.(ctx as never, t.host, { accent: '#00f' } as never);
    expect(moves.length).toBeGreaterThan(2);
    tool.onPointerUp(ev(0, 40), t.host);
    moves.length = 0;
    tool.drawOverlay?.(ctx as never, t.host, { accent: '#00f' } as never);
    expect(moves).toEqual([]);
  });
});

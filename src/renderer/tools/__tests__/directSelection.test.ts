import { describe, expect, it, vi } from 'vitest';
import { createCompound, createLine, createPath, pathFrameOf, pointOnSegment, segmentsOf, selectOnly, translation, withAnchors, type Anchor, type Node, type PathNode } from '../../../core';
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

  it('live shapes with every anchor picked move whole and stay live: no warning, one undo step with the paths', async () => {
    const { t, tool } = setup({ confirmAnswer: 'cancel' });
    const r = t.rect(0, 0, 100, 50);
    const e = t.ellipse(200, 0, 60, 60);
    const p = t.path([corner(0, 200), corner(100, 200)], false);
    drag(tool, t, { x: -20, y: -20 }, { x: 300, y: 220 }); // a marquee around everything
    expect(picked(t, r.id)).toHaveLength(4);
    const before = t.session.historyLength;
    tool.onPointerDown(ev(100, 0), t.host); // a corner of the rectangle
    tool.onPointerMove(ev(110, 20), t.host);
    await flush();
    tool.onPointerMove(ev(130, 40), t.host);
    tool.onPointerUp(ev(130, 40), t.host);
    expect(t.host.confirm).not.toHaveBeenCalled();
    const kids = t.space().layers[0]!.children as Node[];
    expect(kids.map((k) => k.type)).toEqual(['shape', 'shape', 'path']);
    expect(kids[0]!.transform.slice(4)).toEqual([30, 40]);
    expect(kids[1]!.transform.slice(4)).toEqual([230, 40]);
    expect((kids[2] as PathNode).anchors.map((a) => a.p)).toEqual([{ x: 30, y: 240 }, { x: 130, y: 240 }]);
    expect(t.session.historyLength).toBe(before + 1);
    t.session.undo();
    expect((t.space().layers[0]!.children[0] as Node).transform.slice(4)).toEqual([0, 0]);
    void e;
    void p;
  });

  it('a live shape with only some anchors picked still asks before converting', async () => {
    const { t, tool } = setup({ confirmAnswer: 'cancel' });
    t.rect(0, 0, 100, 50);
    drag(tool, t, { x: 80, y: -20 }, { x: 120, y: 70 }); // the two right-hand corners only
    tool.onPointerDown(ev(100, 0), t.host);
    tool.onPointerMove(ev(120, 0), t.host);
    await flush();
    tool.onPointerUp(ev(120, 0), t.host);
    expect(t.host.confirm).toHaveBeenCalledTimes(1);
  });

  it('a live line becomes a path without asking (it has nothing to lose) and moving its end is one undo step', async () => {
    const { t, tool } = setup({ confirmAnswer: 'cancel' });
    const line = t.add(createLine(t.ids, 100)); // from (0,0) to (100,0)
    click(tool, t, 50, 0);
    click(tool, t, 100, 0);
    const before = t.session.historyLength;
    tool.onPointerDown(ev(100, 0), t.host);
    tool.onPointerMove(ev(110, 20), t.host);
    await flush();
    tool.onPointerMove(ev(120, 30), t.host);
    tool.onPointerUp(ev(120, 30), t.host);
    expect(t.host.confirm).not.toHaveBeenCalled();
    const node = t.space().layers[0]!.children[0] as PathNode;
    expect(node.type).toBe('path');
    expect(node.id).toBe(line.id);
    expect(node.anchors.map((a) => a.p)).toEqual([{ x: 0, y: 0 }, { x: 120, y: 30 }]);
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

/** Squares drawn by the overlay (anchors), as [x, y, w, h]. */
const rects = (tool: ReturnType<typeof createDirectSelectionTool>, t: TestHost) => {
  const drawn: number[][] = [];
  const ctx = new Proxy({} as Record<string, unknown>, { get: (_t, k) => (k === 'fillRect' ? (...args: number[]) => drawn.push(args) : () => undefined), set: () => true });
  tool.drawOverlay?.(ctx as never, t.host, { accent: '#00f' } as never);
  return drawn;
};

describe('Direct Selection · anchors revealed under the pointer', () => {

  it('passing over an anchor of an unselected path draws it bigger; leaving it hides it', () => {
    const { t, tool } = setup();
    t.path([corner(100, 100), corner(300, 100), corner(300, 300)], false);
    tool.onPointerMove(ev(301, 299), t.host);
    expect(rects(tool, t)).toEqual([[296, 296, 8, 8]]);
    tool.onPointerMove(ev(200, 250), t.host);
    expect(rects(tool, t)).toEqual([]);
  });

  it('one click on that anchor picks it, without selecting the path first', () => {
    const { t, tool } = setup();
    const p = t.path([corner(100, 100), corner(300, 100), corner(300, 300)], false);
    click(tool, t, 300, 300);
    expect(picked(t, p.id)).toEqual([2]);
    expect(selectedIds(t)).toEqual([p.id]);
  });
});

describe('Direct Selection · isolation mode', () => {
  it('only the anchors of the isolated object can be revealed, picked or marqueed', () => {
    const { t, tool } = setup();
    const inside = square(t, 100, 100, 100);
    const outside = square(t, 300, 100, 100);
    t.host.setIsolation(inside.id);
    tool.onPointerMove(ev(301, 101), t.host);
    expect(rects(tool, t)).toEqual([]);
    click(tool, t, 300, 100);
    expect(picked(t, outside.id)).toEqual([]);
    expect(selectedIds(t)).toEqual([]);
    click(tool, t, 200, 100);
    expect(picked(t, inside.id)).toEqual([1]);
    drag(tool, t, { x: 50, y: 50 }, { x: 450, y: 150 }); // marquee over the top edges of both
    expect(picked(t, inside.id)).toEqual([0, 1]);
    expect(picked(t, outside.id)).toEqual([]);
    expect(selectedIds(t)).toEqual([inside.id]);
  });
});

describe('Direct Selection · smart guides while dragging', () => {
  const pick = (tool: ReturnType<typeof createDirectSelectionTool>, t: TestHost, x: number, y: number) => {
    click(tool, t, x - 50, y + 50); // select the object (inside the square)
    click(tool, t, x, y); // then its anchor
  };

  it('a dragged anchor aligns with the anchors of its own path that stay put', () => {
    const { t, tool } = setup({ options: { smartGuides: true } });
    const p = square(t, 500, 500, 100);
    pick(tool, t, 600, 500);
    drag(tool, t, { x: 600, y: 500 }, { x: 640, y: 503 });
    expect(anchorsOf(t, p.id)[1]!.p).toEqual({ x: 640, y: 500 });
    const shown = vi.mocked(t.host.setSnapLines).mock.calls.flatMap(([lines]) => lines ?? []);
    expect(shown.some((l) => l.kind === 'anchor' && l.axis === 'y')).toBe(true);
  });

  it('a dragged anchor aligns with the anchors of other objects, not only with their boxes', () => {
    const { t, tool } = setup({ options: { smartGuides: true } });
    const p = square(t, 500, 500, 100);
    t.path([corner(800, 900), corner(940, 900), corner(880, 800)]); // apex x = 880 is neither an edge nor the centre
    pick(tool, t, 600, 500);
    drag(tool, t, { x: 600, y: 500 }, { x: 884, y: 560 });
    expect(anchorsOf(t, p.id)[1]!.p).toEqual({ x: 880, y: 560 });
  });

  it('a dragged anchor lands exactly on an anchor of its own path, even with an edge nearer on one axis', () => {
    const { t, tool } = setup({ options: { smartGuides: true } });
    // An open path whose last anchor (520, 540) is where the first one is dragged to.
    const p = t.path([corner(500, 500), corner(700, 500), corner(520, 540)], false);
    // Another object whose left edge (x = 521) is nearer to the pointer than the anchor on the X axis.
    t.rect(521, 700, 50, 50);
    click(tool, t, 600, 500); // the path (on its first segment)
    click(tool, t, 500, 500); // its first anchor
    drag(tool, t, { x: 500, y: 500 }, { x: 521.5, y: 541 });
    expect(anchorsOf(t, p.id)[0]!.p).toEqual({ x: 520, y: 540 });
  });

  it('in a compound path, a dragged anchor lands on an anchor of another of its sub-paths', () => {
    const { t, tool } = setup({ options: { smartGuides: true } });
    // Two open sub-paths, moved 100,100 together by the compound's transform.
    const one = createPath(t.ids, [corner(0, 0), corner(200, 50)], false);
    const two = createPath(t.ids, [corner(200, 50), corner(20, 120)], false);
    const compound = createCompound(t.ids, [one, two]);
    compound.transform = translation(100, 100);
    t.add(compound);
    t.session.select(withAnchors(selectOnly(t.spaceId(), [compound.id]), { [one.id]: [0] }));
    // The first anchor of sub-path one (100,100 on the page) dragged next to the end of sub-path two (120,220).
    drag(tool, t, { x: 100, y: 100 }, { x: 122.5, y: 218.5 });
    expect(anchorsOf(t, one.id)[0]!.p).toEqual({ x: 20, y: 120 });
  });

  it('a dragged anchor lands on a segment of its own path that stays put («trazado»)', () => {
    const { t, tool } = setup({ options: { smartGuides: true } });
    // An open path whose first segment is the diagonal y = x / 2 (from 0,0 to 400,200); its last anchor goes next to it.
    const p = t.path([corner(0, 0), corner(400, 200), corner(430, 500), corner(150, 400)], false);
    click(tool, t, 415, 350);
    click(tool, t, 150, 400);
    drag(tool, t, { x: 150, y: 400 }, { x: 251, y: 123.2 });
    const q = anchorsOf(t, p.id)[3]!.p;
    expect(q.y).toBeCloseTo(q.x / 2, 6); // on the diagonal
    const shown = vi.mocked(t.host.setSnapLines).mock.calls.flatMap(([lines]) => lines ?? []);
    expect(shown.some((l) => l.label === 'path')).toBe(true);
  });

  it('in a compound path, a dragged anchor lands on a segment of another sub-path', () => {
    const { t, tool } = setup({ options: { smartGuides: true } });
    const one = createPath(t.ids, [corner(0, 0), corner(400, 200)], false);
    const two = createPath(t.ids, [corner(450, 0), corner(300, 300)], false);
    const compound = createCompound(t.ids, [one, two]);
    t.add(compound);
    t.session.select(withAnchors(selectOnly(t.spaceId(), [compound.id]), { [two.id]: [0] }));
    // Two's first anchor dragged to just above the middle of sub-path one (200,100).
    drag(tool, t, { x: 450, y: 0 }, { x: 201, y: 97.8 });
    const q = anchorsOf(t, two.id)[0]!.p;
    expect(q.y).toBeCloseTo(q.x / 2, 6); // exactly on the line y = x / 2
  });

  it('nothing snaps with smart guides off', () => {
    const { t, tool } = setup();
    const p = square(t, 500, 500, 100);
    pick(tool, t, 600, 500);
    drag(tool, t, { x: 600, y: 500 }, { x: 640, y: 503 });
    expect(anchorsOf(t, p.id)[1]!.p).toEqual({ x: 640, y: 503 });
  });

  it('a dragged handle snaps too, except while Shift constrains it', () => {
    const { t, tool } = setup({ options: { smartGuides: true } });
    const p = t.path([corner(500, 500, null, [560, 500]), corner(700, 600)], false);
    click(tool, t, 600, 550); // the segment: selects both anchors, handles show
    click(tool, t, 500, 500);
    drag(tool, t, { x: 560, y: 500 }, { x: 563, y: 603 });
    expect(anchorsOf(t, p.id)[0]!.out).toEqual({ x: 563, y: 600 });
  });
});

describe('Direct Selection · snapping to the outline of other objects', () => {
  const pick = (tool: ReturnType<typeof createDirectSelectionTool>, t: TestHost, x: number, y: number) => {
    click(tool, t, x - 50, y + 50);
    click(tool, t, x, y);
  };

  it('an anchor dropped near another object\'s path lands on it ("trazado")', () => {
    const { t, tool } = setup({ options: { smartGuides: true } });
    const p = square(t, 500, 500, 100);
    t.path([corner(650, 900), corner(950, 1000)], false); // a slanted open line
    pick(tool, t, 600, 500);
    // Straight down onto the line y = 900 + (x - 650) / 3, at x = 700 → y = 916.67; the pointer is 2 pt above it.
    drag(tool, t, { x: 600, y: 500 }, { x: 700, y: 914.5 });
    const a = anchorsOf(t, p.id)[1]!.p;
    expect(a.y - (900 + (a.x - 650) / 3)).toBeCloseTo(0, 3);
    const shown = vi.mocked(t.host.setSnapLines).mock.calls.flatMap(([lines]) => lines ?? []);
    expect(shown.some((l) => l.kind === 'path' && l.label === 'path')).toBe(true);
  });

  it('with an axis already aligned, it slides to where the path crosses that axis ("intersección")', () => {
    const { t, tool } = setup({ options: { smartGuides: true } });
    const p = square(t, 500, 500, 100);
    t.path([corner(800, 900), corner(940, 900), corner(880, 800)]); // apex x = 880 (anchor-only alignment)
    t.path([corner(700, 700), corner(1100, 830)], false); // crosses x = 880 at y = 758.5
    pick(tool, t, 600, 500);
    drag(tool, t, { x: 600, y: 500 }, { x: 883, y: 757 });
    const a = anchorsOf(t, p.id)[1]!.p;
    expect(a.x).toBeCloseTo(880, 3);
    expect(a.y).toBeCloseTo(700 + (880 - 700) * (130 / 400), 3);
    const shown = vi.mocked(t.host.setSnapLines).mock.calls.flatMap(([lines]) => lines ?? []);
    expect(shown.some((l) => l.kind === 'intersection')).toBe(true);
  });

  it('far from every path nothing is pulled, and smart guides off never pull', () => {
    const on = setup({ options: { smartGuides: true } });
    const p1 = square(on.t, 500, 500, 100);
    on.t.path([corner(650, 900), corner(950, 1000)], false);
    pick(on.tool, on.t, 600, 500);
    drag(on.tool, on.t, { x: 600, y: 500 }, { x: 700, y: 880 });
    expect(anchorsOf(on.t, p1.id)[1]!.p).toEqual({ x: 700, y: 880 });

    const off = setup();
    const p2 = square(off.t, 500, 500, 100);
    off.t.path([corner(650, 900), corner(950, 1000)], false);
    pick(off.tool, off.t, 600, 500);
    drag(off.tool, off.t, { x: 600, y: 500 }, { x: 700, y: 914.5 });
    expect(anchorsOf(off.t, p2.id)[1]!.p).toEqual({ x: 700, y: 914.5 });
  });
});

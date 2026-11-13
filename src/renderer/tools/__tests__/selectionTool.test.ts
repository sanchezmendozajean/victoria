import { describe, expect, it, vi } from 'vitest';
import { cornerAnchor, createCompound, createPath, pathFrameOf, selectionBounds, translation, type PathNode } from '../../../core';
import { createSelectionTool } from '../selectionTool';
import { createTransformTool } from '../transformTools';
import { click, createTestHost, drag, ev, nodeX, nodeY, selectedIds } from './fakeHost';

const setup = (init?: Parameters<typeof createTestHost>[0]) => {
  const t = createTestHost(init);
  return { t, tool: createSelectionTool() };
};
const bounds = (t: ReturnType<typeof createTestHost>, id: string) => selectionBounds(t.space(), [id])!;
/** Bounds rounded to 6 decimals (scaling goes through a matrix, so exact floats are not guaranteed). */
const rounded = (r: { minX: number; minY: number; maxX: number; maxY: number }) => ({ minX: +r.minX.toFixed(6), minY: +r.minY.toFixed(6), maxX: +r.maxX.toFixed(6), maxY: +r.maxY.toFixed(6) });

describe('Selection tool · picking (specs/03 · Selección)', () => {
  it('a click on the fill selects the object; a click on empty space deselects', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    click(tool, t, 50, 50);
    expect(selectedIds(t)).toEqual([a.id]);
    click(tool, t, 500, 500);
    expect(selectedIds(t)).toEqual([]);
  });

  it('Shift+click adds and removes', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    const b = t.rect(200, 0);
    click(tool, t, 50, 50);
    click(tool, t, 250, 50, { shiftKey: true });
    expect(selectedIds(t)).toEqual([a.id, b.id]);
    click(tool, t, 50, 50, { shiftKey: true });
    expect(selectedIds(t)).toEqual([b.id]);
  });

  it('an object with only a stroke cannot be picked from its inside', () => {
    const { t, tool } = setup();
    const r = t.rect(0, 0, 100, 100, { fill: false, stroke: 2 });
    click(tool, t, 50, 50);
    expect(selectedIds(t)).toEqual([]);
    click(tool, t, 0, 50); // its outline works
    expect(selectedIds(t)).toEqual([r.id]);
  });

  it('locked and hidden objects are not picked', () => {
    const { t, tool } = setup();
    t.rect(0, 0, 100, 100, { locked: true });
    t.rect(200, 0, 100, 100, { hidden: true });
    click(tool, t, 50, 50);
    click(tool, t, 250, 50);
    expect(selectedIds(t)).toEqual([]);
  });
});

describe('Selection tool · groups and isolation', () => {
  it('picks the group, isolates on double click and leaves by double clicking outside', () => {
    const { t, tool } = setup();
    const c1 = t.newRect(0, 0, 50, 50);
    const c2 = t.newRect(100, 0, 50, 50);
    const g = t.group([c1, c2]);
    const other = t.rect(400, 0);

    click(tool, t, 25, 25);
    expect(selectedIds(t)).toEqual([g.id]);

    click(tool, t, 25, 25, { clickCount: 2 });
    expect(t.host.setIsolation).toHaveBeenCalledWith(g.id);
    expect(t.host.isolation).toBe(g.id);
    expect(selectedIds(t)).toEqual([c1.id]);

    click(tool, t, 125, 25); // inside the isolated group the unit is the child
    expect(selectedIds(t)).toEqual([c2.id]);
    click(tool, t, 450, 50); // other objects cannot be picked while isolated
    expect(selectedIds(t)).toEqual([]);

    click(tool, t, 450, 50, { clickCount: 2 });
    expect(t.host.isolation).toBeNull();
    click(tool, t, 450, 50);
    expect(selectedIds(t)).toEqual([other.id]);
  });

  it('a double click on a single path isolates that path; others cannot be picked until leaving', () => {
    const { t, tool } = setup();
    const p = t.rect(0, 0, 50, 50);
    const other = t.rect(400, 0);
    click(tool, t, 25, 25, { clickCount: 2 });
    expect(t.host.isolation).toBe(p.id);
    expect(selectedIds(t)).toEqual([p.id]);
    click(tool, t, 25, 25, { clickCount: 2 }); // again on it: stays isolated
    expect(t.host.isolation).toBe(p.id);
    click(tool, t, 450, 50);
    expect(selectedIds(t)).toEqual([]);
    click(tool, t, 25, 25);
    expect(selectedIds(t)).toEqual([p.id]);
    click(tool, t, 450, 50, { clickCount: 2 });
    expect(t.host.isolation).toBeNull();
    click(tool, t, 450, 50);
    expect(selectedIds(t)).toEqual([other.id]);
  });

  it('inside an isolated compound path each sub-path is picked, moved and turned on its own', () => {
    const { t, tool } = setup();
    const square = (x: number) => createPath(t.ids, [cornerAnchor({ x, y: 0 }), cornerAnchor({ x: x + 50, y: 0 }), cornerAnchor({ x: x + 50, y: 50 }), cornerAnchor({ x, y: 50 })], true) as PathNode;
    const one = square(0);
    const two = square(100);
    const compound = t.solid(createCompound(t.ids, [one, two]));
    compound.transform = translation(100, 100); // sub-paths live in the compound's space
    t.add(compound);
    const firstOf = (id: string) => pathFrameOf(t.space(), id)!.path.anchors[0]!.p;

    click(tool, t, 125, 125, { clickCount: 2 });
    expect(t.host.isolation).toBe(compound.id);
    click(tool, t, 225, 125); // sub-path two: all its anchors, nothing of one
    expect(selectedIds(t)).toEqual([compound.id]);
    expect(t.session.selection.anchors).toEqual({ [two.id]: [0, 1, 2, 3] });

    drag(tool, t, { x: 225, y: 125 }, { x: 235, y: 145 }); // moves two only
    expect(firstOf(two.id)).toEqual({ x: 110, y: 20 });
    expect(firstOf(one.id)).toEqual({ x: 0, y: 0 });
    t.session.undo();
    expect(firstOf(two.id)).toEqual({ x: 100, y: 0 });

    click(tool, t, 125, 125, { shiftKey: true }); // Shift adds one
    expect(Object.keys(t.session.selection.anchors ?? {}).sort()).toEqual([one.id, two.id].sort());
    tool.onKeyDown?.({ key: 'ArrowRight', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false } as never, t.host);
    expect(firstOf(one.id)).toEqual({ x: 1, y: 0 });
    expect(firstOf(two.id)).toEqual({ x: 101, y: 0 });

    click(tool, t, 400, 400); // empty: nothing picked; a marquee over two picks it alone
    drag(tool, t, { x: 215, y: 90 }, { x: 260, y: 110 });
    expect(t.session.selection.anchors).toEqual({ [two.id]: [0, 1, 2, 3] });
  });

  it('Alt+drag inside an isolated compound path copies the sub-path above its original; one undo removes it', () => {
    const { t, tool } = setup();
    const square = (x: number) => createPath(t.ids, [cornerAnchor({ x, y: 0 }), cornerAnchor({ x: x + 50, y: 0 }), cornerAnchor({ x: x + 50, y: 50 }), cornerAnchor({ x, y: 50 })], true) as PathNode;
    const one = square(0);
    const two = square(100);
    const compound = t.solid(createCompound(t.ids, [one, two]));
    compound.transform = translation(100, 100);
    t.add(compound);
    const children = () => (pathFrameOf(t.space(), one.id)!.owner as typeof compound).children;
    t.host.setIsolation(compound.id);
    click(tool, t, 125, 125);
    drag(tool, t, { x: 125, y: 125 }, { x: 125, y: 205 }, { altKey: true });
    const after = children();
    expect(after.map((p) => p.id).slice(0, 1)).toEqual([one.id]);
    expect(after[2]!.id).toBe(two.id);
    expect(after).toHaveLength(3);
    const copy = after[1]!;
    expect(copy.anchors[0]!.p).toEqual({ x: 0, y: 80 });
    expect(after[0]!.anchors[0]!.p).toEqual({ x: 0, y: 0 });
    expect(t.session.selection.anchors).toEqual({ [copy.id]: [0, 1, 2, 3] });
    t.session.undo();
    expect(children()).toHaveLength(2);
  });

  it('the Reflect tool flips only the picked sub-path of an isolated compound path', () => {
    const { t, tool } = setup();
    const tri = (x: number) => createPath(t.ids, [cornerAnchor({ x, y: 0 }), cornerAnchor({ x: x + 40, y: 0 }), cornerAnchor({ x, y: 20 })], true) as PathNode;
    const one = tri(0);
    const two = tri(100);
    const compound = t.solid(createCompound(t.ids, [one, two]));
    t.add(compound);
    t.host.setIsolation(compound.id);
    click(tool, t, 110, 5); // pick two
    const reflect = createTransformTool('reflect');
    click(reflect, t, 120, 0); // origin
    click(reflect, t, 120, 50); // vertical axis through x = 120
    const xs = (id: string) => pathFrameOf(t.space(), id)!.path.anchors.map((a) => Math.round(a.p.x));
    expect(xs(two.id)).toEqual([140, 100, 140]);
    expect(xs(one.id)).toEqual([0, 40, 0]);
  });

  it('Escape leaves isolation when nothing is being dragged', () => {
    const { t, tool } = setup({ isolation: 'g' });
    tool.onKey?.('Escape', t.host);
    expect(t.host.setIsolation).toHaveBeenCalledWith(null);
  });
});

describe('Selection tool · moving', () => {
  it('dragging moves the selection and is one undo step', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    const before = t.session.historyLength;
    drag(tool, t, { x: 50, y: 50 }, { x: 80, y: 70 });
    expect(nodeX(t, a.id)).toBe(30);
    expect(nodeY(t, a.id)).toBe(20);
    expect(t.session.historyLength).toBe(before + 1);
    t.session.undo();
    expect(nodeX(t, a.id)).toBe(0);
    expect(selectedIds(t)).toEqual([a.id]); // pressing selected it (selection is not history)
  });

  it('Shift constrains the move to multiples of 45°', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    drag(tool, t, { x: 50, y: 50 }, { x: 100, y: 60 }, { shiftKey: true });
    expect(nodeY(t, a.id)).toBeCloseTo(0, 9);
    expect(nodeX(t, a.id)).toBeCloseTo(Math.hypot(50, 10), 9);
  });

  it('dragging an unselected object selects it and moves only it', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    const b = t.rect(200, 0);
    click(tool, t, 50, 50);
    drag(tool, t, { x: 250, y: 50 }, { x: 260, y: 50 });
    expect(selectedIds(t)).toEqual([b.id]);
    expect(nodeX(t, a.id)).toBe(0);
    expect(nodeX(t, b.id)).toBe(210);
  });

  it('dragging one of several selected objects moves them all', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    const b = t.rect(200, 0);
    click(tool, t, 50, 50);
    click(tool, t, 250, 50, { shiftKey: true });
    drag(tool, t, { x: 50, y: 50 }, { x: 60, y: 90 });
    expect(nodeX(t, a.id)).toBe(10);
    expect(nodeX(t, b.id)).toBe(210);
    expect(nodeY(t, b.id)).toBe(40);
  });

  it('a click without moving on one of several selected objects makes it the key object and keeps the selection', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    const b = t.rect(200, 0);
    click(tool, t, 50, 50);
    click(tool, t, 250, 50, { shiftKey: true });
    click(tool, t, 50, 50);
    expect(t.host.setKeyObject).toHaveBeenLastCalledWith(a.id);
    expect(selectedIds(t)).toEqual([a.id, b.id]);
  });

  it('clicking the key object again lets go of it', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    t.rect(200, 0);
    click(tool, t, 50, 50);
    click(tool, t, 250, 50, { shiftKey: true });
    (t.host as { keyObject: string | null }).keyObject = a.id;
    click(tool, t, 50, 50);
    expect(t.host.setKeyObject).toHaveBeenLastCalledWith(null);
  });

  it('tiny movements below the drag threshold change nothing', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    const before = t.session.historyLength;
    tool.onPointerDown(ev(50, 50), t.host);
    tool.onPointerMove(ev(51, 51), t.host);
    tool.onPointerUp(ev(51, 51), t.host);
    expect(nodeX(t, a.id)).toBe(0);
    expect(t.session.historyLength).toBe(before);
  });

  it('Alt+drag leaves the original and moves a copy, as a single step', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    const before = t.session.historyLength;
    drag(tool, t, { x: 50, y: 50 }, { x: 150, y: 50 }, { altKey: true });
    const kids = t.space().layers[0]!.children;
    expect(kids).toHaveLength(2);
    expect(nodeX(t, a.id)).toBe(0);
    const copy = kids[1]!;
    expect(copy.id).not.toBe(a.id);
    expect(nodeX(t, copy.id)).toBe(100);
    expect(selectedIds(t)).toEqual([copy.id]);
    expect(t.session.historyLength).toBe(before + 1);
    t.session.undo();
    expect(t.space().layers[0]!.children).toHaveLength(1);
  });

  it('Alt pressed mid-drag leaves the original where it was pressed and the copy under the cursor', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    tool.onPointerDown(ev(50, 50), t.host);
    tool.onPointerMove(ev(80, 50), t.host);
    tool.onPointerMove(ev(120, 50), t.host);
    tool.onPointerMove(ev(150, 50, { altKey: true }), t.host);
    tool.onPointerUp(ev(150, 50, { altKey: true }), t.host);
    const kids = t.space().layers[0]!.children;
    expect(kids).toHaveLength(2);
    expect(nodeX(t, a.id)).toBe(0);
    expect(nodeX(t, kids[1]!.id)).toBe(100);
  });

  it('Escape during a drag puts everything back', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    const before = t.session.historyLength;
    tool.onPointerDown(ev(50, 50), t.host);
    tool.onPointerMove(ev(80, 50), t.host);
    tool.onPointerMove(ev(120, 50), t.host);
    expect(nodeX(t, a.id)).toBe(70);
    tool.onKey?.('Escape', t.host);
    expect(nodeX(t, a.id)).toBe(0);
    expect(t.session.historyLength).toBe(before);
    expect(t.session.canRedo).toBe(false);
    tool.onPointerUp(ev(120, 50), t.host);
    expect(nodeX(t, a.id)).toBe(0);
  });

  it('remembers the move for Transform Again', () => {
    const { t, tool } = setup();
    t.rect(0, 0);
    drag(tool, t, { x: 50, y: 50 }, { x: 70, y: 80 });
    expect(t.host.rememberTransform).toHaveBeenLastCalledWith({ matrix: translation(20, 30), copy: false });
  });

  it('shows the distance moved next to the cursor and clears it when done', () => {
    const { t, tool } = setup();
    t.rect(0, 0);
    tool.onPointerDown(ev(50, 50), t.host);
    tool.onPointerMove(ev(70, 60), t.host);
    expect(t.host.setMeasure).toHaveBeenLastCalledWith(expect.stringContaining('Δx: 20 pt'), expect.anything());
    tool.onPointerUp(ev(70, 60), t.host);
    expect(t.host.setMeasure).toHaveBeenLastCalledWith(null);
  });
});

describe('Selection tool · marquee', () => {
  it('selects what the marquee touches (touch = select), Shift adds', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0, 50, 50);
    const b = t.rect(200, 0, 50, 50);
    const c = t.rect(400, 400, 50, 50);
    drag(tool, t, { x: -10, y: -10 }, { x: 260, y: 60 });
    expect(selectedIds(t)).toEqual([a.id, b.id]);
    drag(tool, t, { x: 390, y: 390 }, { x: 460, y: 460 }, { shiftKey: true });
    expect(selectedIds(t)).toEqual([a.id, b.id, c.id]);
  });

  it('a marquee that only grazes an object still selects it', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0, 50, 50);
    drag(tool, t, { x: 45, y: 45 }, { x: 200, y: 200 });
    expect(selectedIds(t)).toEqual([a.id]);
  });

  it('a marquee over nothing clears the selection', () => {
    const { t, tool } = setup();
    t.rect(0, 0, 50, 50);
    click(tool, t, 25, 25);
    drag(tool, t, { x: 300, y: 300 }, { x: 400, y: 400 });
    expect(selectedIds(t)).toEqual([]);
  });

  it('draws the marquee rectangle only while dragging', () => {
    const { t, tool } = setup();
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, { get: (_t, k) => (k === 'strokeRect' ? () => calls.push('rect') : () => undefined), set: () => true });
    const theme = { accent: '#00f', accentSoft: '#00f3' } as never;
    tool.drawOverlay?.(ctx as never, t.host, theme);
    expect(calls).toEqual([]);
    tool.onPointerDown(ev(10, 10), t.host);
    tool.onPointerMove(ev(100, 100), t.host);
    tool.drawOverlay?.(ctx as never, t.host, theme);
    expect(calls).toEqual(['rect']);
  });
});

describe('Selection tool · bounding box (specs/03 · Selección)', () => {
  it('dragging a corner handle scales around the opposite corner', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    click(tool, t, 50, 50);
    const before = t.session.historyLength;
    drag(tool, t, { x: 100, y: 100 }, { x: 200, y: 200 });
    expect(bounds(t, a.id)).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 200 });
    expect(t.session.historyLength).toBe(before + 1);
    expect(t.host.rememberTransform).toHaveBeenLastCalledWith({ matrix: [2, 0, 0, 2, 0, 0], copy: false });
  });

  it('an edge handle scales one axis only', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    click(tool, t, 50, 50);
    drag(tool, t, { x: 100, y: 50 }, { x: 150, y: 80 });
    expect(bounds(t, a.id)).toEqual({ minX: 0, minY: 0, maxX: 150, maxY: 100 });
  });

  it('Shift keeps the proportions of a corner drag', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    click(tool, t, 50, 50);
    drag(tool, t, { x: 100, y: 100 }, { x: 200, y: 150 }, { shiftKey: true });
    const b = bounds(t, a.id);
    expect(b.maxX - b.minX).toBeCloseTo(b.maxY - b.minY, 9);
  });

  it('Alt scales from the centre', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    click(tool, t, 50, 50);
    drag(tool, t, { x: 100, y: 50 }, { x: 150, y: 50 }, { altKey: true });
    expect(bounds(t, a.id)).toMatchObject({ minX: -50, maxX: 150 });
  });

  it('dragging past the opposite side mirrors the object', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    click(tool, t, 50, 50);
    drag(tool, t, { x: 100, y: 50 }, { x: -50, y: 50 });
    expect(bounds(t, a.id)).toMatchObject({ minX: -50, maxX: 0 });
  });

  it('just outside a corner the pointer rotates around the centre; Shift steps by 45°', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    click(tool, t, 50, 50);
    drag(tool, t, { x: 110, y: -10 }, { x: 110, y: 110 });
    const m = (t.space().layers[0]!.children[0] as { transform: number[] }).transform;
    expect(m[0]).toBeCloseTo(0, 9);
    expect(m[1]).toBeCloseTo(1, 9); // 90° clockwise
    const b = bounds(t, a.id);
    expect(b.maxX - b.minX).toBeCloseTo(100, 6);

    t.session.undo();
    drag(tool, t, { x: 110, y: -10 }, { x: 105, y: 130 }, { shiftKey: true }); // ~70° → snaps to 45° steps
    const r = (t.space().layers[0]!.children[0] as { transform: [number, number, number, number, number, number] }).transform;
    expect(Math.atan2(r[1], r[0]) / (Math.PI / 4)).toBeCloseTo(Math.round(Math.atan2(r[1], r[0]) / (Math.PI / 4)), 9);
  });

  it('does nothing on the handles when there is no selection', () => {
    const { t, tool } = setup();
    t.rect(0, 0);
    const before = t.session.historyLength;
    drag(tool, t, { x: 300, y: 300 }, { x: 400, y: 400 });
    expect(t.session.historyLength).toBe(before);
  });

  it('shows resize cursors over handles and the rotate cursor beside the corners', () => {
    const { t, tool } = setup();
    t.rect(0, 0);
    click(tool, t, 50, 50);
    tool.onPointerMove(ev(100, 100), t.host);
    expect(tool.cursor(false)).toBe('nwse-resize');
    tool.onPointerMove(ev(100, 50), t.host);
    expect(tool.cursor(false)).toBe('ew-resize');
    tool.onPointerMove(ev(110, -10), t.host);
    expect(tool.cursor(false)).toContain('url(');
    tool.onPointerMove(ev(50, 50), t.host);
    expect(tool.cursor(false)).toBe('default');
  });

  it('has no handles while edges are hidden', () => {
    const { t, tool } = setup({ options: { hideEdges: true } });
    const a = t.rect(0, 0);
    click(tool, t, 50, 50);
    drag(tool, t, { x: 100, y: 100 }, { x: 200, y: 200 }); // would have been a corner drag
    expect(bounds(t, a.id)).not.toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 200 });
  });
});

describe('Selection tool · keyboard', () => {
  const key = (k: string, extra: object = {}) => ({ key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...extra });

  it('arrows move 1 pt, Shift+arrow 10 pt, and a run of presses is one undo step', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    click(tool, t, 50, 50);
    const before = t.session.historyLength;
    expect(tool.onKeyDown?.(key('ArrowRight'), t.host)).toBe(true);
    tool.onKeyDown?.(key('ArrowRight'), t.host);
    tool.onKeyDown?.(key('ArrowRight'), t.host);
    expect(nodeX(t, a.id)).toBe(3);
    expect(t.session.historyLength).toBe(before + 1);
    tool.onKeyDown?.(key('ArrowDown', { shiftKey: true }), t.host);
    expect(nodeY(t, a.id)).toBe(10);
    tool.onKeyDown?.(key('ArrowLeft'), t.host);
    tool.onKeyDown?.(key('ArrowUp'), t.host);
    expect(nodeX(t, a.id)).toBe(2);
    expect(nodeY(t, a.id)).toBe(9);
  });

  it('ignores arrows without a selection, with Ctrl, or for other keys', () => {
    const { t, tool } = setup();
    t.rect(0, 0);
    expect(tool.onKeyDown?.(key('ArrowRight'), t.host)).toBe(false);
    click(tool, t, 50, 50);
    expect(tool.onKeyDown?.(key('ArrowRight', { ctrlKey: true }), t.host)).toBe(false);
    expect(tool.onKeyDown?.(key('a'), t.host)).toBe(false);
  });
});

describe('Selection tool · snapping', () => {
  it('smart guides align a moving object with the edges of others', () => {
    const { t, tool } = setup({ options: { smartGuides: true } });
    const a = t.rect(0, 0);
    t.rect(1000, 0); // far from the artboard lines, so only this object attracts
    drag(tool, t, { x: 50, y: 50 }, { x: 947, y: 52 }); // a.maxX = 997 → 1000, a.minY = 2 → 0
    expect(nodeX(t, a.id)).toBe(900);
    expect(nodeY(t, a.id)).toBe(0);
    expect(t.host.setSnapLines).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ axis: 'x', value: 1000 })]));
    expect(t.host.setSnapLines).toHaveBeenLastCalledWith(null); // cleared on release
  });

  it('smart guides also react while resizing: the dragged edge snaps to the edge of another object', () => {
    const { t, tool } = setup({ options: { smartGuides: true } });
    const a = t.rect(0, 0);
    t.rect(1000, 0, 100, 100); // far from the artboard lines, so only this object attracts
    click(tool, t, 50, 50);
    drag(tool, t, { x: 100, y: 50 }, { x: 997, y: 50 }); // the east edge reaches 997 → snaps to 1000
    expect(rounded(bounds(t, a.id))).toEqual({ minX: 0, minY: 0, maxX: 1000, maxY: 100 });
    expect(t.host.setSnapLines).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ axis: 'x', value: 1000 })]));
    expect(t.host.setSnapLines).toHaveBeenLastCalledWith(null); // cleared on release
  });

  it('resizing snaps only the axes the handle moves along', () => {
    const { t, tool } = setup({ options: { smartGuides: true } });
    const a = t.rect(0, 0);
    t.rect(1000, 0, 100, 100);
    click(tool, t, 50, 50);
    // y = 52 would line up with the other object's top (0)... but an east handle does not move the top or the bottom.
    drag(tool, t, { x: 100, y: 50 }, { x: 997, y: 52 });
    expect(rounded(bounds(t, a.id))).toEqual({ minX: 0, minY: 0, maxX: 1000, maxY: 100 });
    const allLines = (t.host.setSnapLines as ReturnType<typeof vi.fn>).mock.calls.flatMap((c) => (c[0] ?? []) as Array<{ axis: string }>);
    expect(allLines.every((l) => l.axis === 'x')).toBe(true);
  });

  it('a corner handle snaps both of its edges', () => {
    const { t, tool } = setup({ options: { smartGuides: true } });
    const a = t.rect(0, 0);
    t.rect(1000, 700, 100, 100);
    click(tool, t, 50, 50);
    drag(tool, t, { x: 100, y: 100 }, { x: 997, y: 698 });
    expect(rounded(bounds(t, a.id))).toEqual({ minX: 0, minY: 0, maxX: 1000, maxY: 700 });
  });

  it('resizing does not snap when smart guides are off', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    t.rect(1000, 0, 100, 100);
    click(tool, t, 50, 50);
    drag(tool, t, { x: 100, y: 50 }, { x: 997, y: 50 });
    expect(bounds(t, a.id).maxX).toBeCloseTo(997, 6);
  });

  it('does not snap when smart guides are off', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    t.rect(1000, 0);
    drag(tool, t, { x: 50, y: 50 }, { x: 947, y: 52 });
    expect(nodeX(t, a.id)).toBe(897);
    expect(nodeY(t, a.id)).toBe(2);
  });

  it('snaps to the grid when "Ajustar a cuadrícula" is on', () => {
    const { t, tool } = setup({ options: { snapGrid: true } });
    const a = t.rect(0, 0, 90, 90);
    drag(tool, t, { x: 50, y: 50 }, { x: 53, y: 50 }); // grid step 9: x 3 → 0
    expect(nodeX(t, a.id)).toBe(0);
  });

  it('snaps to guides', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    t.session.run({ label: 'guide.add', spaceId: t.spaceId(), apply: (d) => void d.spaces[0]!.guides.push({ id: 'gd', orientation: 'vertical', position: 200, locked: false }) });
    drag(tool, t, { x: 50, y: 50 }, { x: 148, y: 50 }); // a.maxX = 198 → 200
    expect(nodeX(t, a.id)).toBe(100);
  });
});

describe('Selection tool · hover', () => {
  it('highlights the object under the cursor and clears on leave', () => {
    const { t, tool } = setup();
    const a = t.rect(0, 0);
    tool.onPointerMove(ev(50, 50), t.host);
    expect(t.host.setHover).toHaveBeenLastCalledWith(expect.objectContaining({ id: a.id }));
    tool.onLeave?.(t.host);
    expect(t.host.setHover).toHaveBeenLastCalledWith(null);
  });
});

describe('the bounding box turns with the object (Illustrator)', () => {
  const setupTurned = async () => {
    const { multiply, rotation, translation, orientedBounds, worldRotationOf, selectOnly, createRect } = await import('../../../core');
    const t = createTestHost();
    const tool = createSelectionTool();
    const r = createRect(t.ids, 200, 100);
    r.transform = multiply(translation(300, 300), rotation(Math.PI / 6));
    t.add(r);
    t.session.select(selectOnly(t.spaceId(), [r.id]));
    return { t, tool, r, orientedBounds, worldRotationOf };
  };

  it('scales along the object axes: the east handle of a rotated rectangle keeps its angle and stretches it', async () => {
    const { t, tool, r, orientedBounds, worldRotationOf } = await setupTurned();
    const a = Math.PI / 6;
    // Centre of the rectangle in the Space, and its east handle one half-width along the turned x axis.
    const centre = { x: 300 + 100 * Math.cos(a) - 50 * Math.sin(a), y: 300 + 100 * Math.sin(a) + 50 * Math.cos(a) };
    const east = { x: centre.x + 100 * Math.cos(a), y: centre.y + 100 * Math.sin(a) };
    const to = { x: east.x + 50 * Math.cos(a), y: east.y + 50 * Math.sin(a) };
    drag(tool, t, east, to);
    const space = t.space();
    const theta = worldRotationOf(space, r.id);
    expect(theta).toBeCloseTo(a, 6);
    const box = orientedBounds(space, [r.id], theta)!;
    expect(box.maxX - box.minX).toBeCloseTo(250, 4);
    expect(box.maxY - box.minY).toBeCloseTo(100, 4);
  });

  it('rotating from a corner of the turned box keeps the box aligned with the object', async () => {
    const { t, tool, r, worldRotationOf } = await setupTurned();
    const a = Math.PI / 6;
    const centre = { x: 300 + 100 * Math.cos(a) - 50 * Math.sin(a), y: 300 + 100 * Math.sin(a) + 50 * Math.cos(a) };
    // Just outside the south-east corner of the turned box.
    const corner = { x: centre.x + 100 * Math.cos(a) - 50 * Math.sin(a), y: centre.y + 100 * Math.sin(a) + 50 * Math.cos(a) };
    const out = { x: corner.x + 10 * Math.cos(a + Math.PI / 4), y: corner.y + 10 * Math.sin(a + Math.PI / 4) };
    tool.onPointerDown(ev(out.x, out.y), t.host);
    tool.onPointerMove(ev(out.x + 40, out.y - 30), t.host);
    tool.onPointerMove(ev(out.x + 80, out.y - 60), t.host);
    tool.onPointerUp(ev(out.x + 80, out.y - 60), t.host);
    expect(worldRotationOf(t.space(), r.id)).not.toBeCloseTo(a, 3); // it turned
    // And the box used for the next gesture is aligned with the new angle: its width is still 200.
    const { orientedBoxOf } = await import('../orientedBox');
    const box = orientedBoxOf(t.space(), [r.id])!;
    expect(box.theta).toBeCloseTo(worldRotationOf(t.space(), r.id), 9);
    expect(box.rect.maxX - box.rect.minX).toBeCloseTo(200, 4);
  });

  it('several objects rotated together keep a turned box', async () => {
    const { t, tool } = await setupTurned();
    const other = t.rect(600, 300, 100, 100);
    const { selectOnly } = await import('../../../core');
    t.session.select(selectOnly(t.spaceId(), [t.space().layers[0]!.children[0]!.id, other.id]));
    const { selectionBounds } = await import('../../../core');
    const bounds = selectionBounds(t.space(), t.session.selection.ids)!;
    // Grab the rotate zone just outside the north-east corner of the axis-aligned box.
    const out = { x: bounds.maxX + 8, y: bounds.minY - 8 };
    tool.onPointerDown(ev(out.x, out.y), t.host);
    tool.onPointerMove(ev(out.x + 30, out.y + 40), t.host);
    tool.onPointerUp(ev(out.x + 30, out.y + 40), t.host);
    expect(t.session.selection.ids).toHaveLength(2);
    const draw = vi.fn();
    const ctx = new Proxy({} as Record<string, unknown>, { get: (_t, k) => (k === 'moveTo' ? draw : () => undefined), set: () => true });
    tool.drawOverlay?.(ctx as never, t.host, { accent: '#00f', accentSoft: '#00f3' } as never);
    expect(draw).toHaveBeenCalled(); // the turned outline is drawn as a path
  });
});

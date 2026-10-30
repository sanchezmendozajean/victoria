import { describe, expect, it, vi } from 'vitest';
import { cornerAnchor, type Anchor, type PathNode } from '../../../core';
import { penCursor } from '../cursors';
import { DEFAULT_PREFERENCES, usePreferences } from '../../prefs/preferences';
import { createPenTool } from '../penTool';
import { click, createTestHost, drag, ev, selectedIds, type TestHost } from './fakeHost';

const setup = () => ({ t: createTestHost(), tool: createPenTool() });
const paths = (t: TestHost): PathNode[] => t.space().layers[0]!.children.filter((c) => c.type === 'path') as PathNode[];
const only = (t: TestHost): PathNode => {
  const list = paths(t);
  expect(list).toHaveLength(1);
  return list[0]!;
};
const hasHandles = (a: Anchor) => a.in !== null || a.out !== null;
const key = (k: string, extra: object = {}) => ({ key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...extra });

describe('Pen · placing anchors (specs/03 · Pluma 1–2)', () => {
  it('1 · a click places a corner anchor without handles; the next click makes a straight segment', () => {
    const { t, tool } = setup();
    click(tool, t, 10, 10);
    click(tool, t, 110, 10);
    const p = only(t);
    expect(p.closed).toBe(false);
    expect(p.anchors.map((a) => a.p)).toEqual([{ x: 10, y: 10 }, { x: 110, y: 10 }]);
    expect(p.anchors.every((a) => a.kind === 'corner' && !hasHandles(a))).toBe(true);
    expect(selectedIds(t)).toEqual([p.id]);
  });

  it('2 · click and drag makes a smooth anchor: the drag is the out handle, the in handle is its mirror', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    drag(tool, t, { x: 100, y: 0 }, { x: 140, y: 30 });
    const a = only(t).anchors[1]!;
    expect(a.kind).toBe('smooth');
    expect(a.out).toEqual({ x: 140, y: 30 });
    expect(a.in).toEqual({ x: 60, y: -30 });
  });

  it('every anchor is one undo step, and undoing the first removes the path', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    drag(tool, t, { x: 100, y: 0 }, { x: 140, y: 30 });
    click(tool, t, 200, 50);
    expect(only(t).anchors).toHaveLength(3);
    t.session.undo();
    expect(only(t).anchors).toHaveLength(2);
    t.session.undo();
    expect(only(t).anchors).toHaveLength(1);
    t.session.undo();
    expect(paths(t)).toHaveLength(0);
  });

  it('a click on empty space after Escape starts a new path', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    click(tool, t, 50, 0);
    tool.onKey?.('Escape', t.host);
    click(tool, t, 300, 300);
    click(tool, t, 400, 300);
    expect(paths(t)).toHaveLength(2);
  });
});

describe('Pen · modifiers while dragging (3)', () => {
  it('Alt breaks the handle: from then on only the out handle follows the cursor', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    tool.onPointerDown(ev(100, 0), t.host);
    tool.onPointerMove(ev(130, 20), t.host);
    expect(only(t).anchors[1]!.in).toEqual({ x: 70, y: -20 });
    tool.onPointerMove(ev(140, 40, { altKey: true }), t.host);
    tool.onPointerMove(ev(150, 60), t.host); // Alt released: stays broken
    tool.onPointerUp(ev(150, 60), t.host);
    const a = only(t).anchors[1]!;
    expect(a.out).toEqual({ x: 150, y: 60 });
    expect(a.in).toEqual({ x: 70, y: -20 });
    expect(a.kind).toBe('corner');
  });

  it('Shift constrains the handle to multiples of 45°', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    drag(tool, t, { x: 100, y: 100 }, { x: 180, y: 108 }, { shiftKey: true });
    const a = only(t).anchors[1]!;
    expect(a.out!.y).toBeCloseTo(100, 9);
    expect(a.out!.x).toBeGreaterThan(100);
  });

  it('Shift on a click constrains the new anchor to 45° from the previous one', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    click(tool, t, 100, 12, { shiftKey: true });
    expect(only(t).anchors[1]!.p.y).toBeCloseTo(0, 9);
  });

  it('Space moves the anchor being placed, keeping the handle', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    tool.onPointerDown(ev(100, 100), t.host);
    tool.onPointerMove(ev(130, 100), t.host);
    expect(tool.wantsSpace?.()).toBe(true);
    tool.onKeyDown?.(key(' '), t.host);
    tool.onPointerMove(ev(150, 120), t.host); // moved by (20, 20)
    tool.onKeyUp?.(' ', t.host);
    tool.onPointerUp(ev(150, 120), t.host);
    const a = only(t).anchors[1]!;
    expect(a.p).toEqual({ x: 120, y: 120 });
    expect(a.out).toEqual({ x: 150, y: 120 });
  });
});

describe('Pen · the last anchor (4)', () => {
  it('a click on the last anchor retracts its out handle', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    drag(tool, t, { x: 100, y: 0 }, { x: 140, y: 30 });
    click(tool, t, 100, 0);
    const a = only(t).anchors[1]!;
    expect(a.out).toBeNull();
    expect(a.in).not.toBeNull();
    expect(only(t).anchors).toHaveLength(2); // no new anchor
  });

  it('a drag from the last anchor creates an independent out handle', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    drag(tool, t, { x: 100, y: 0 }, { x: 140, y: 30 });
    click(tool, t, 100, 0); // retract
    drag(tool, t, { x: 100, y: 0 }, { x: 100, y: 60 });
    const a = only(t).anchors[1]!;
    expect(a.out).toEqual({ x: 100, y: 60 });
    expect(a.in).toEqual({ x: 60, y: -30 });
    expect(a.kind).toBe('corner');
  });
});

describe('Pen · rubber band (5)', () => {
  it('draws the next segment from the last anchor to the cursor', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    tool.onPointerMove(ev(80, 40), t.host);
    const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), bezierCurveTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(), lineTo: vi.fn(), arc: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn() };
    tool.drawOverlay?.(ctx as never, t.host, { accent: '#00f' } as never);
    expect(ctx.bezierCurveTo).toHaveBeenCalledWith(0, 0, 80, 40, 80, 40);
  });

  it('follows the out handle of the last anchor when it has one', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    drag(tool, t, { x: 100, y: 0 }, { x: 140, y: 30 });
    tool.onPointerMove(ev(200, 100), t.host);
    const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), bezierCurveTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(), lineTo: vi.fn(), arc: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn() };
    tool.drawOverlay?.(ctx as never, t.host, { accent: '#00f' } as never);
    expect(ctx.bezierCurveTo).toHaveBeenCalledWith(140, 30, 200, 100, 200, 100);
  });
});

describe('Pen · closing (6)', () => {
  it('hovering the first anchor shows the close cursor; a click closes the path and ends it', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    click(tool, t, 100, 0);
    click(tool, t, 100, 100);
    tool.onPointerMove(ev(0, 0), t.host);
    expect(tool.cursor(false)).toBe(penCursor('close'));
    click(tool, t, 0, 0);
    const p = only(t);
    expect(p.closed).toBe(true);
    expect(p.anchors).toHaveLength(3);
    // The next click starts a different path.
    click(tool, t, 400, 400);
    expect(paths(t)).toHaveLength(2);
  });

  it('click and drag on the first anchor closes with a curve', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    click(tool, t, 100, 0);
    click(tool, t, 100, 100);
    drag(tool, t, { x: 0, y: 0 }, { x: -50, y: 20 });
    const p = only(t);
    expect(p.closed).toBe(true);
    expect(p.anchors[0]!.kind).toBe('smooth');
    expect(p.anchors[0]!.out).toEqual({ x: -50, y: 20 });
    expect(p.anchors[0]!.in).toEqual({ x: 50, y: -20 });
  });

  it('closing is one undo step', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    click(tool, t, 100, 0);
    click(tool, t, 100, 100);
    click(tool, t, 0, 0);
    t.session.undo();
    expect(only(t).closed).toBe(false);
    expect(only(t).anchors).toHaveLength(3);
  });
});

describe('Pen · finishing open (7)', () => {
  it('Escape and Enter end the path; a lone anchor is discarded', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    tool.onKey?.('Escape', t.host);
    expect(paths(t)).toHaveLength(0);
    click(tool, t, 0, 0);
    click(tool, t, 100, 0);
    tool.onKey?.('Enter', t.host);
    click(tool, t, 300, 300);
    click(tool, t, 400, 300);
    expect(paths(t)).toHaveLength(2);
  });

  it('Ctrl+click on empty space finishes the path (and deselects)', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    click(tool, t, 100, 0);
    click(tool, t, 500, 500, { ctrlKey: true });
    expect(selectedIds(t)).toEqual([]);
    click(tool, t, 300, 300);
    click(tool, t, 400, 300);
    expect(paths(t)).toHaveLength(2);
  });

  it('switching tool (cancel) ends the path', () => {
    const { t, tool } = setup();
    click(tool, t, 0, 0);
    click(tool, t, 100, 0);
    tool.cancel?.(t.host);
    click(tool, t, 300, 300);
    click(tool, t, 400, 300);
    expect(paths(t)).toHaveLength(2);
  });
});

describe('Pen · continuing and joining (8)', () => {
  const open = (t: TestHost, ...pts: Array<[number, number]>) => t.path(pts.map(([x, y]) => cornerAnchor({ x, y })), false, false);

  it('hovering the end of an open path shows "/" and a click continues it', () => {
    const { t, tool } = setup();
    const p = open(t, [0, 0], [100, 0]);
    tool.onPointerMove(ev(100, 0), t.host);
    expect(tool.cursor(false)).toBe(penCursor('continue'));
    click(tool, t, 100, 0);
    click(tool, t, 200, 50);
    expect(only(t).id).toBe(p.id);
    expect(only(t).anchors.map((a) => a.p.x)).toEqual([0, 100, 200]);
  });

  it('continuing from the start reverses the path first', () => {
    const { t, tool } = setup();
    open(t, [0, 0], [100, 0]);
    click(tool, t, 0, 0);
    click(tool, t, -50, 50);
    expect(only(t).anchors.map((a) => a.p.x)).toEqual([100, 0, -50]);
  });

  it('a click on the end of another open path joins them', () => {
    const { t, tool } = setup();
    const a = open(t, [0, 0], [100, 0]);
    open(t, [300, 0], [200, 0]);
    click(tool, t, 100, 0); // continue a
    click(tool, t, 200, 0); // end of the other path
    const list = paths(t);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(a.id);
    expect(list[0]!.anchors.map((x) => x.p.x)).toEqual([0, 100, 200, 300]);
  });
});

describe('Pen · auto add and delete on the selected path (9)', () => {
  it('over a segment of the selected path it adds an anchor; over an anchor it deletes it', () => {
    const { t, tool } = setup();
    const p = t.path([cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: 100, y: 0 }), cornerAnchor({ x: 100, y: 100 })], false, false);
    t.session.select({ spaceId: t.spaceId(), ids: [p.id] });
    tool.onPointerMove(ev(50, 0), t.host);
    expect(tool.cursor(false)).toBe(penCursor('add'));
    click(tool, t, 50, 0);
    expect(only(t).anchors.map((a) => a.p.x)[1]).toBeCloseTo(50, 3);
    expect(only(t).anchors).toHaveLength(4);
    tool.onPointerMove(ev(50, 0), t.host);
    expect(tool.cursor(false)).toBe(penCursor('delete'));
    click(tool, t, 50, 0);
    expect(only(t).anchors).toHaveLength(3);
  });

  it('is off when the preference says so: the cursor stays a plain pen and the segment no longer offers to add a point', () => {
    const { t, tool } = setup();
    const p = t.path([cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: 100, y: 0 }), cornerAnchor({ x: 100, y: 100 })], false, false);
    t.session.select({ spaceId: t.spaceId(), ids: [p.id] });
    usePreferences.getState().set({ autoAddDelete: false });
    try {
      tool.onPointerMove(ev(50, 0), t.host);
      expect(tool.cursor(false)).toBe(penCursor('new'));
    } finally {
      usePreferences.getState().set({ autoAddDelete: DEFAULT_PREFERENCES.autoAddDelete });
    }
  });

  it('does nothing special over unselected paths', () => {
    const { t, tool } = setup();
    t.path([cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: 100, y: 0 }), cornerAnchor({ x: 100, y: 100 })], false, false);
    t.session.select({ spaceId: t.spaceId(), ids: [] });
    tool.onPointerMove(ev(50, 0), t.host);
    expect(tool.cursor(false)).toBe(penCursor('new'));
  });

  it('adding to a live shape converts it to a path in the same step', () => {
    const { t, tool } = setup();
    const r = t.rect(0, 0, 100, 100);
    t.session.select({ spaceId: t.spaceId(), ids: [r.id] });
    const before = t.session.historyLength;
    click(tool, t, 50, 0);
    expect(t.space().layers[0]!.children[0]!.type).toBe('path');
    expect(t.session.historyLength).toBe(before + 1);
  });
});

describe('Pen · temporary tools (10) and cursors (11)', () => {
  it('Ctrl acts as Direct Selection: it selects an anchor of a path instead of drawing', () => {
    const { t, tool } = setup();
    const p = t.path([cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: 100, y: 0 }), cornerAnchor({ x: 100, y: 100 })], true);
    t.session.select({ spaceId: t.spaceId(), ids: [p.id] });
    click(tool, t, 100, 0, { ctrlKey: true });
    expect(t.session.selection.anchors?.[p.id]).toEqual([1]);
    expect(paths(t)).toHaveLength(1);
  });

  it('Alt over an anchor converts it (smooth → corner) instead of drawing', () => {
    const { t, tool } = setup();
    const p = t.path(
      [
        { p: { x: 0, y: 0 }, in: null, out: null, kind: 'corner' },
        { p: { x: 100, y: 0 }, in: { x: 70, y: 0 }, out: { x: 130, y: 0 }, kind: 'smooth' },
        { p: { x: 200, y: 0 }, in: null, out: null, kind: 'corner' },
      ],
      false,
      false,
    );
    t.session.select({ spaceId: t.spaceId(), ids: [p.id] });
    tool.onPointerMove(ev(100, 0, { altKey: true }), t.host);
    expect(tool.cursor(true)).toBe(penCursor('convert'));
    click(tool, t, 100, 0, { altKey: true });
    const a = only(t).anchors[1]!;
    expect(a.in).toBeNull();
    expect(a.out).toBeNull();
    expect(a.kind).toBe('corner');
  });

  it('shows the "*" cursor for a new path and the plain nib while drawing', () => {
    const { t, tool } = setup();
    tool.onPointerMove(ev(300, 300), t.host);
    expect(tool.cursor(false)).toBe(penCursor('new'));
    click(tool, t, 300, 300);
    tool.onPointerMove(ev(350, 300), t.host);
    expect(tool.cursor(false)).toBe(penCursor('none'));
  });

  it('the badge cursors are all different', () => {
    const all = (['none', 'new', 'continue', 'close', 'add', 'delete', 'convert'] as const).map(penCursor);
    expect(new Set(all).size).toBe(all.length);
  });
});

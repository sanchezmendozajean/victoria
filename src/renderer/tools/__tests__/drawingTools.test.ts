import { describe, expect, it } from 'vitest';
import { cornerAnchor, pointOnSegment, segmentsOf, type Anchor, type PathNode, type ShapeNode } from '../../../core';
import { createAnchorAddTool, createAnchorDeleteTool, createConvertTool } from '../anchorTools';
import { createCurvatureTool } from '../curvatureTool';
import { createPencilTool } from '../pencilTool';
import { createScissorsTool } from '../scissorsTool';
import { buildShape, defaultShapePrefs, isDegenerate, shapeFromDrag } from '../shapeDrag';
import { createShapeTool, shapePrefs } from '../shapeTools';
import { click, createTestHost, drag, ev, selectedIds, type TestHost } from './fakeHost';

const children = (t: TestHost) => t.space().layers[0]!.children;
const paths = (t: TestHost): PathNode[] => children(t).filter((c) => c.type === 'path') as PathNode[];
const shapes = (t: TestHost): ShapeNode[] => children(t).filter((c) => c.type === 'shape') as ShapeNode[];
const key = (k: string, extra: object = {}) => ({ key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...extra });
const line = (t: TestHost, ...pts: Array<[number, number]>) => t.path(pts.map(([x, y]) => cornerAnchor({ x, y })), false, false);

describe('Convert Anchor Point (Shift+C)', () => {
  const smoothPath = (t: TestHost) =>
    t.path(
      [
        cornerAnchor({ x: 0, y: 0 }),
        { p: { x: 100, y: 0 }, in: { x: 70, y: 0 }, out: { x: 130, y: 0 }, kind: 'smooth' },
        cornerAnchor({ x: 200, y: 0 }),
      ],
      false,
      false,
    );

  it('a click on a smooth anchor retracts both handles', () => {
    const t = createTestHost();
    const tool = createConvertTool();
    const p = smoothPath(t);
    t.session.select({ spaceId: t.spaceId(), ids: [p.id] });
    click(tool, t, 100, 0);
    const a = paths(t)[0]!.anchors[1]!;
    expect(a.in).toBeNull();
    expect(a.out).toBeNull();
    expect(a.kind).toBe('corner');
  });

  it('dragging from a corner anchor pulls out symmetric handles (smooth)', () => {
    const t = createTestHost();
    const tool = createConvertTool();
    const p = line(t, [0, 0], [100, 0], [200, 0]);
    t.session.select({ spaceId: t.spaceId(), ids: [p.id] });
    drag(tool, t, { x: 100, y: 0 }, { x: 140, y: 40 });
    const a = paths(t)[0]!.anchors[1]!;
    expect(a.kind).toBe('smooth');
    expect(a.out).toEqual({ x: 140, y: 40 });
    expect(a.in).toEqual({ x: 60, y: -40 });
  });

  it('dragging a handle moves only that handle and makes the anchor a corner', () => {
    const t = createTestHost();
    const tool = createConvertTool();
    const p = smoothPath(t);
    t.session.select({ spaceId: t.spaceId(), ids: [p.id] });
    drag(tool, t, { x: 130, y: 0 }, { x: 130, y: 50 });
    const a = paths(t)[0]!.anchors[1]!;
    expect(a.out).toEqual({ x: 130, y: 50 });
    expect(a.in).toEqual({ x: 70, y: 0 });
    expect(a.kind).toBe('corner');
  });

  it('is one undo step and Escape mid-drag restores the anchor', () => {
    const t = createTestHost();
    const tool = createConvertTool();
    const p = line(t, [0, 0], [100, 0], [200, 0]);
    t.session.select({ spaceId: t.spaceId(), ids: [p.id] });
    const before = t.session.historyLength;
    drag(tool, t, { x: 100, y: 0 }, { x: 140, y: 40 });
    expect(t.session.historyLength).toBe(before + 1);
    tool.onPointerDown(ev(100, 0), t.host);
    tool.onPointerMove(ev(150, 50), t.host);
    tool.onKey?.('Escape', t.host);
    expect(t.session.historyLength).toBe(before + 1);
  });
});

describe('Add and Delete Anchor Point', () => {
  it('+ splits a segment keeping the curve; − removes an anchor', () => {
    const t = createTestHost();
    const add = createAnchorAddTool();
    const del = createAnchorDeleteTool();
    line(t, [0, 0], [100, 0], [100, 100]);
    click(add, t, 50, 0);
    expect(paths(t)[0]!.anchors).toHaveLength(4);
    click(del, t, 100, 0);
    expect(paths(t)[0]!.anchors).toHaveLength(3);
  });

  it('− on the last anchors of a path removes the whole path', () => {
    const t = createTestHost();
    const del = createAnchorDeleteTool();
    line(t, [0, 0], [100, 0]);
    click(del, t, 0, 0);
    expect(paths(t)).toHaveLength(0);
    expect(selectedIds(t)).toEqual([]);
  });

  it('works on live shapes by converting them in the same undo step', () => {
    const t = createTestHost();
    const del = createAnchorDeleteTool();
    t.rect(0, 0, 100, 100);
    const before = t.session.historyLength;
    click(del, t, 100, 100);
    expect(children(t)[0]!.type).toBe('path');
    expect((children(t)[0] as PathNode).anchors).toHaveLength(3);
    expect(t.session.historyLength).toBe(before + 1);
  });
});

describe('Scissors (C)', () => {
  it('cutting an open path inside a segment makes two paths with coincident ends', () => {
    const t = createTestHost();
    const tool = createScissorsTool();
    line(t, [0, 0], [100, 0]);
    click(tool, t, 50, 0);
    const list = paths(t);
    expect(list).toHaveLength(2);
    expect(list[0]!.anchors.at(-1)!.p.x).toBeCloseTo(50, 3);
    expect(list[1]!.anchors[0]!.p.x).toBeCloseTo(50, 3);
    expect(new Set(list.map((p) => p.id)).size).toBe(2);
    expect(selectedIds(t)).toHaveLength(2);
  });

  it('cutting a closed path at an anchor opens it', () => {
    const t = createTestHost();
    const tool = createScissorsTool();
    t.path([cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: 100, y: 0 }), cornerAnchor({ x: 100, y: 100 })], true);
    click(tool, t, 100, 0);
    const [p] = paths(t);
    expect(paths(t)).toHaveLength(1);
    expect(p!.closed).toBe(false);
    expect(p!.anchors).toHaveLength(4);
  });

  it('is a single undo step', () => {
    const t = createTestHost();
    const tool = createScissorsTool();
    line(t, [0, 0], [100, 0]);
    click(tool, t, 50, 0);
    t.session.undo();
    expect(paths(t)).toHaveLength(1);
    expect(paths(t)[0]!.anchors).toHaveLength(2);
  });

  it('clicking away from any path does nothing', () => {
    const t = createTestHost();
    const tool = createScissorsTool();
    line(t, [0, 0], [100, 0]);
    const before = t.session.historyLength;
    click(tool, t, 50, 50);
    expect(t.session.historyLength).toBe(before);
  });
});

describe('Curvature (Shift+~)', () => {
  it('builds a smooth curve through every clicked point', () => {
    const t = createTestHost();
    const tool = createCurvatureTool();
    click(tool, t, 0, 0);
    click(tool, t, 100, 80);
    click(tool, t, 200, 0);
    click(tool, t, 300, 80);
    tool.onKey?.('Enter', t.host);
    const p = paths(t)[0]!;
    expect(p.anchors.map((a) => a.p)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 80 }, { x: 200, y: 0 }, { x: 300, y: 80 }]);
    expect(p.anchors[1]!.in).not.toBeNull();
    // The curve really passes through the points.
    const segs = segmentsOf({ anchors: p.anchors, closed: false });
    expect(pointOnSegment(segs[0]!, 1)).toEqual({ x: 100, y: 80 });
  });

  it('Alt+click makes a corner anchor', () => {
    const t = createTestHost();
    const tool = createCurvatureTool();
    click(tool, t, 0, 0);
    click(tool, t, 100, 80);
    click(tool, t, 200, 0, { altKey: true });
    click(tool, t, 300, 80);
    const p = paths(t)[0]!;
    expect(p.anchors[2]!.kind).toBe('corner');
    expect(p.anchors[2]!.in).toBeNull();
  });

  it('double click on the point just placed toggles it to a corner without adding another', () => {
    const t = createTestHost();
    const tool = createCurvatureTool();
    click(tool, t, 0, 0);
    click(tool, t, 100, 80);
    click(tool, t, 200, 0);
    click(tool, t, 200, 0, { clickCount: 2 });
    const p = paths(t)[0]!;
    expect(p.anchors).toHaveLength(3);
    expect(p.anchors[2]!.kind).toBe('corner');
  });

  it('a click on the first point closes the path', () => {
    const t = createTestHost();
    const tool = createCurvatureTool();
    click(tool, t, 0, 0);
    click(tool, t, 100, 80);
    click(tool, t, 200, 0);
    click(tool, t, 0, 0);
    expect(paths(t)[0]!.closed).toBe(true);
    expect(paths(t)[0]!.anchors).toHaveLength(3);
  });

  it('dragging an anchor of the selected path moves it and recomputes the curve', () => {
    const t = createTestHost();
    const tool = createCurvatureTool();
    click(tool, t, 0, 0);
    click(tool, t, 100, 80);
    click(tool, t, 200, 0);
    tool.onKey?.('Escape', t.host);
    const before = paths(t)[0]!.anchors[1]!.out!;
    drag(tool, t, { x: 100, y: 80 }, { x: 100, y: 140 });
    const p = paths(t)[0]!;
    expect(p.anchors[1]!.p).toEqual({ x: 100, y: 140 });
    expect(p.anchors[1]!.out).not.toEqual(before);
  });

  it('each point is an undo step', () => {
    const t = createTestHost();
    const tool = createCurvatureTool();
    click(tool, t, 0, 0);
    click(tool, t, 100, 80);
    click(tool, t, 200, 0);
    t.session.undo();
    expect(paths(t)[0]!.anchors).toHaveLength(2);
  });
});

describe('Pencil (N)', () => {
  const stroke = (t: TestHost, tool: ReturnType<typeof createPencilTool>, pts: Array<[number, number]>, extra = {}) => {
    tool.onPointerDown(ev(pts[0]![0], pts[0]![1], extra), t.host);
    for (const [x, y] of pts.slice(1)) tool.onPointerMove(ev(x, y, extra), t.host);
    const last = pts[pts.length - 1]!;
    tool.onPointerUp(ev(last[0], last[1], extra), t.host);
  };
  const arc = Array.from({ length: 40 }, (_, i): [number, number] => [100 * Math.cos((i / 39) * Math.PI), 100 * Math.sin((i / 39) * Math.PI)]);

  it('fits a freehand stroke to few anchors', () => {
    const t = createTestHost();
    stroke(t, createPencilTool(), arc);
    const p = paths(t)[0]!;
    expect(p.closed).toBe(false);
    expect(p.anchors.length).toBeLessThan(6);
    expect(p.anchors.length).toBeGreaterThanOrEqual(2);
    expect(selectedIds(t)).toEqual([p.id]);
  });

  it('a stroke ending on its start closes the path', () => {
    const t = createTestHost();
    const circle = Array.from({ length: 60 }, (_, i): [number, number] => [100 * Math.cos((i / 60) * 2 * Math.PI), 100 * Math.sin((i / 60) * 2 * Math.PI)]);
    stroke(t, createPencilTool(), [...circle, [100, 2]]);
    expect(paths(t)[0]!.closed).toBe(true);
  });

  it('a plain click draws nothing; Escape cancels a stroke', () => {
    const t = createTestHost();
    const tool = createPencilTool();
    click(tool, t, 5, 5);
    expect(paths(t)).toHaveLength(0);
    tool.onPointerDown(ev(0, 0), t.host);
    tool.onPointerMove(ev(50, 50), t.host);
    tool.onKey?.('Escape', t.host);
    tool.onPointerUp(ev(80, 80), t.host);
    expect(paths(t)).toHaveLength(0);
  });

  it('a stroke that starts on the end of an open path continues it', () => {
    const t = createTestHost();
    const existing = line(t, [0, 0], [100, 0]);
    stroke(t, createPencilTool(), [
      [100, 0],
      [120, 0],
      [140, 0],
      [160, 0],
      [180, 0],
      [200, 0],
    ]);
    expect(paths(t)).toHaveLength(1);
    expect(paths(t)[0]!.id).toBe(existing.id);
    expect(paths(t)[0]!.anchors.at(-1)!.p.x).toBeCloseTo(200, 3);
  });
});

describe('shape tools · drags (specs/03 · Formas)', () => {
  const prefs = defaultShapePrefs();
  const spec = (kind: Parameters<typeof shapeFromDrag>[0]['kind'], start: [number, number], end: [number, number], mods: { shift?: boolean; alt?: boolean } = {}) =>
    shapeFromDrag({ kind, start: { x: start[0], y: start[1] }, end: { x: end[0], y: end[1] }, shift: !!mods.shift, alt: !!mods.alt, prefs });

  it('a rectangle runs corner to corner; Alt from the centre; Shift makes it square', () => {
    expect(spec('rect', [10, 20], [110, 70])).toMatchObject({ shape: 'rect', w: 100, h: 50, transform: [1, 0, 0, 1, 10, 20] });
    expect(spec('rect', [10, 20], [-90, -30])).toMatchObject({ w: 100, h: 50, transform: [1, 0, 0, 1, -90, -30] });
    expect(spec('rect', [100, 100], [150, 120], { alt: true })).toMatchObject({ w: 100, h: 40, transform: [1, 0, 0, 1, 50, 80] });
    expect(spec('rect', [0, 0], [100, 40], { shift: true })).toMatchObject({ w: 100, h: 100 });
  });

  it('the rounded rectangle uses the remembered radius; the ellipse has no corners', () => {
    expect(spec('rounded-rect', [0, 0], [100, 50])).toMatchObject({ shape: 'rect', radius: 12 });
    expect(spec('ellipse', [0, 0], [100, 50])).toMatchObject({ shape: 'ellipse', w: 100, h: 50 });
  });

  it('polygon and star are drawn from the centre; the drag angle turns them and Shift keeps them upright', () => {
    const up = spec('polygon', [100, 100], [100, 40]);
    expect(up).toMatchObject({ shape: 'polygon', radius: 60, sides: 5 });
    expect(up.transform[0]).toBeCloseTo(1, 9); // dragging straight up: no turn
    const right = spec('polygon', [100, 100], [160, 100]);
    expect(right.transform[1]).toBeCloseTo(1, 9); // 90° turn
    const upright = spec('polygon', [100, 100], [160, 100], { shift: true });
    expect(upright.transform).toEqual([1, 0, 0, 1, 100, 100]);
    expect(spec('star', [0, 0], [0, -100])).toMatchObject({ shape: 'star', r1: 100, r2: 50, points: 5 });
  });

  it('a line goes from start to end; Shift snaps to 45°; Alt makes the start its centre', () => {
    const l = spec('line', [0, 0], [30, 40]);
    expect(l).toMatchObject({ shape: 'line', length: 50 });
    const snapped = spec('line', [0, 0], [100, 12], { shift: true });
    expect(snapped.shape === 'line' && snapped.transform[1]).toBeCloseTo(0, 9);
    const centred = spec('line', [50, 50], [100, 50], { alt: true });
    expect(centred).toMatchObject({ length: 100, transform: [1, 0, 0, 1, 0, 50] });
  });

  it('a zero-size drag is degenerate', () => {
    expect(isDegenerate(spec('rect', [5, 5], [5, 5]))).toBe(true);
    expect(isDegenerate(spec('rect', [5, 5], [6, 5]))).toBe(false);
  });

  it('builds live shapes (lines are stroke-only)', () => {
    const t = createTestHost();
    const rect = buildShape(t.ids, spec('rect', [0, 0], [10, 10]));
    expect(rect.shape).toBe('rect');
    expect(rect.appearance.items.map((i) => i.kind)).toEqual(['fill', 'stroke']);
    const lineNode = buildShape(t.ids, spec('line', [0, 0], [10, 0]));
    expect(lineNode.appearance.items.map((i) => i.kind)).toEqual(['stroke']);
  });
});

describe('shape tools · interaction', () => {
  it('dragging creates one live shape as a single undo step and selects it', () => {
    const t = createTestHost();
    const tool = createShapeTool('tool-rect', 'rect');
    const before = t.session.historyLength;
    drag(tool, t, { x: 10, y: 10 }, { x: 110, y: 60 });
    expect(shapes(t)).toHaveLength(1);
    expect(shapes(t)[0]!.params).toMatchObject({ w: 100, h: 50 });
    expect(selectedIds(t)).toEqual([shapes(t)[0]!.id]);
    expect(t.session.historyLength).toBe(before + 1);
    t.session.undo();
    expect(shapes(t)).toHaveLength(0);
  });

  it('a click without dragging asks for exact dimensions', () => {
    const t = createTestHost();
    const tool = createShapeTool('tool-ellipse', 'ellipse');
    click(tool, t, 40, 50);
    expect(t.host.openShapeDialog).toHaveBeenCalledWith('ellipse', { x: 40, y: 50 });
    expect(shapes(t)).toHaveLength(0);
  });

  it('Escape during the drag discards the shape', () => {
    const t = createTestHost();
    const tool = createShapeTool('tool-rect', 'rect');
    tool.onPointerDown(ev(0, 0), t.host);
    tool.onPointerMove(ev(80, 80), t.host);
    expect(shapes(t)).toHaveLength(1);
    tool.onKey?.('Escape', t.host);
    tool.onPointerUp(ev(80, 80), t.host);
    expect(shapes(t)).toHaveLength(0);
  });

  it('Space moves the shape while dragging it out', () => {
    const t = createTestHost();
    const tool = createShapeTool('tool-rect', 'rect');
    tool.onPointerDown(ev(0, 0), t.host);
    tool.onPointerMove(ev(100, 50), t.host);
    expect(tool.wantsSpace?.()).toBe(true);
    tool.onKeyDown?.(key(' '), t.host);
    tool.onPointerMove(ev(130, 80), t.host);
    tool.onKeyUp?.(' ', t.host);
    tool.onPointerUp(ev(130, 80), t.host);
    expect(shapes(t)[0]!.transform.slice(4)).toEqual([30, 30]);
    expect(shapes(t)[0]!.params).toMatchObject({ w: 100, h: 50 });
  });

  it('↑ / ↓ change the sides of a polygon and the points of a star during the drag', () => {
    const t = createTestHost();
    const polygon = createShapeTool('tool-polygon', 'polygon');
    const startSides = shapePrefs.sides;
    polygon.onPointerDown(ev(100, 100), t.host);
    polygon.onPointerMove(ev(100, 40), t.host);
    expect(polygon.onKeyDown?.(key('ArrowUp'), t.host)).toBe(true);
    polygon.onKeyDown?.(key('ArrowUp'), t.host);
    polygon.onKeyDown?.(key('ArrowDown'), t.host);
    polygon.onPointerUp(ev(100, 40), t.host);
    expect((shapes(t)[0]!.params as { sides: number }).sides).toBe(startSides + 1);
    shapePrefs.sides = startSides;
  });

  it('Ctrl keeps the star inner radius while the outer one grows', () => {
    const t = createTestHost();
    const star = createShapeTool('tool-star', 'star');
    star.onPointerDown(ev(0, 0), t.host);
    star.onPointerMove(ev(0, -100), t.host);
    star.onPointerMove(ev(0, -200, { ctrlKey: true }), t.host);
    star.onPointerMove(ev(0, -300, { ctrlKey: true }), t.host);
    star.onPointerUp(ev(0, -300), t.host);
    const params = shapes(t)[0]!.params as { r1: number; r2: number };
    expect(params.r1).toBeCloseTo(300, 9);
    expect(params.r2).toBeCloseTo(100, 9);
  });

  it('does not create anything without a drawable layer', () => {
    const t = createTestHost();
    t.session.run({ label: 'x', spaceId: t.spaceId(), apply: (d) => void (d.spaces[0]!.layers[0]!.locked = true) });
    const tool = createShapeTool('tool-rect', 'rect');
    Object.defineProperty(t.host, 'activeLayerId', { get: () => null });
    drag(tool, t, { x: 0, y: 0 }, { x: 10, y: 10 });
    expect(shapes(t)).toHaveLength(0);
  });
});

describe('anchors helper types', () => {
  it('keeps Anchor type exported for the tools', () => {
    const a: Anchor = cornerAnchor({ x: 1, y: 2 });
    expect(a.kind).toBe('corner');
  });
});

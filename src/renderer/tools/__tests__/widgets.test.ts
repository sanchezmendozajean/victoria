import { describe, expect, it } from 'vitest';
import { cornerAnchor, createEllipse, createPolygon, createStar, nodeGeometry, selectOnly, translation, withAnchors, type PathNode, type ShapeNode } from '../../../core';
import { listWidgets, widgetAt } from '../cornerWidgets';
import { createDirectSelectionTool } from '../directSelectionTool';
import { createSelectionTool } from '../selectionTool';
import { click, createTestHost, drag, ev, type TestHost } from './fakeHost';

const first = (t: TestHost) => t.space().layers[0]!.children[0]! as ShapeNode;
const params = <T,>(t: TestHost) => first(t).params as T;

describe('widget geometry', () => {
  it('a rectangle has one widget per corner, resting inside the corner at a fixed screen distance', () => {
    const t = createTestHost();
    const r = t.rect(0, 0, 200, 100);
    const sel = selectOnly(t.spaceId(), [r.id]);
    const list = listWidgets(t.space(), sel, 1, false);
    expect(list.map((w) => w.pos)).toEqual([
      { x: 14, y: 14 },
      { x: 186, y: 14 },
      { x: 186, y: 86 },
      { x: 14, y: 86 },
    ]);
    // At 200 % the same screen distance is half the document distance.
    expect(listWidgets(t.space(), sel, 2, false)[0]!.pos).toEqual({ x: 7, y: 7 });
  });

  it('follows the radius once it is bigger than the rest distance', () => {
    const t = createTestHost();
    const r = t.rect(0, 0, 200, 100);
    t.session.run({ label: 'x', spaceId: t.spaceId(), apply: (d) => void ((d.spaces[0]!.layers[0]!.children[0] as ShapeNode & { params: { radii: number[] } }).params.radii = [30, 30, 30, 30]) });
    const list = listWidgets(t.space(), selectOnly(t.spaceId(), [r.id]), 1, false);
    expect(list[0]!.pos).toEqual({ x: 30, y: 30 });
  });

  it('an ellipse has start and end pie widgets; polygons and stars have one corner widget', () => {
    const t = createTestHost();
    const e = t.add(createEllipse(t.ids, 200, 100));
    const p = t.add(createPolygon(t.ids, 50, 5));
    const s = t.add(createStar(t.ids, 50, 25, 5));
    const list = listWidgets(t.space(), selectOnly(t.spaceId(), [e.id, p.id, s.id]), 1, false);
    expect(list.map((w) => w.kind)).toEqual(['pie', 'pie', 'polygon', 'star']);
    expect(list[0]!.pos).toEqual({ x: 200, y: 50 });
  });

  it('skips locked objects and objects that are not live shapes', () => {
    const t = createTestHost();
    const locked = t.rect(0, 0, 10, 10, { locked: true });
    const path = t.path([cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: 5, y: 0 })], false);
    expect(listWidgets(t.space(), selectOnly(t.spaceId(), [locked.id, path.id]), 1, false)).toEqual([]);
  });

  it('picks the nearest widget within the screen tolerance', () => {
    const t = createTestHost();
    const r = t.rect(0, 0, 200, 100);
    const list = listWidgets(t.space(), selectOnly(t.spaceId(), [r.id]), 1, false);
    expect(widgetAt(list, { x: 16, y: 12 }, 1)?.kind).toBe('rect');
    expect(widgetAt(list, { x: 60, y: 60 }, 1)).toBeNull();
  });
});

describe('dragging widgets with the Selection tool', () => {
  const setup = () => {
    const t = createTestHost();
    const tool = createSelectionTool();
    const r = t.rect(0, 0, 200, 100);
    t.session.select(selectOnly(t.spaceId(), [r.id]));
    return { t, tool, r };
  };

  it('rounds all the corners together and is one undo step', () => {
    const { t, tool } = setup();
    const before = t.session.historyLength;
    drag(tool, t, { x: 14, y: 14 }, { x: 34, y: 34 });
    expect(params<{ radii: number[] }>(t).radii).toEqual([34, 34, 34, 34]);
    expect(t.session.historyLength).toBe(before + 1);
    t.session.undo();
    expect(params<{ radii: number[] }>(t).radii).toEqual([0, 0, 0, 0]);
  });

  it('Alt changes only the dragged corner', () => {
    const { t, tool } = setup();
    drag(tool, t, { x: 14, y: 14 }, { x: 34, y: 34 }, { altKey: true });
    expect(params<{ radii: number[] }>(t).radii).toEqual([34, 0, 0, 0]);
  });

  it('the radius never exceeds half of the shorter side and never goes negative', () => {
    const t = createTestHost();
    const tool = createSelectionTool();
    const tall = t.rect(0, 0, 200, 300);
    t.session.select(selectOnly(t.spaceId(), [tall.id]));
    drag(tool, t, { x: 14, y: 14 }, { x: 180, y: 180 });
    expect(params<{ radii: number[] }>(t).radii).toEqual([100, 100, 100, 100]);
    t.session.undo();
    drag(tool, t, { x: 14, y: 14 }, { x: -40, y: -40 });
    expect(params<{ radii: number[] }>(t).radii).toEqual([0, 0, 0, 0]);
  });

  it('Alt+click on a corner widget cycles the corner type', () => {
    const { t, tool } = setup();
    click(tool, t, 14, 14, { altKey: true });
    expect(params<{ cornerType: string }>(t).cornerType).toBe('inverted');
    click(tool, t, 14, 14, { altKey: true });
    expect(params<{ cornerType: string }>(t).cornerType).toBe('chamfer');
    click(tool, t, 14, 14, { altKey: true });
    expect(params<{ cornerType: string }>(t).cornerType).toBe('round');
  });

  it('Escape during the drag restores the shape', () => {
    const { t, tool } = setup();
    const before = t.session.historyLength;
    tool.onPointerDown(ev(14, 14), t.host);
    tool.onPointerMove(ev(30, 30), t.host);
    expect(params<{ radii: number[] }>(t).radii[0]).toBeGreaterThan(0);
    tool.onKey?.('Escape', t.host);
    expect(params<{ radii: number[] }>(t).radii[0]).toBe(0);
    expect(t.session.historyLength).toBe(before);
  });

  it('a widget press does not move or deselect the object', () => {
    const { t, tool, r } = setup();
    drag(tool, t, { x: 14, y: 14 }, { x: 34, y: 34 });
    expect(first(t).transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(t.session.selection.ids).toEqual([r.id]);
  });

  it('a polygon corner widget sets its corner radius', () => {
    const t = createTestHost();
    const tool = createSelectionTool();
    const polygon = createPolygon(t.ids, 100, 6);
    polygon.transform = translation(200, 200);
    const p = t.add(polygon);
    t.session.select(selectOnly(t.spaceId(), [p.id]));
    // Vertex 0 is at (0, −100) of the polygon; the widget rests 14 px toward the centre.
    drag(tool, t, { x: 200, y: 114 }, { x: 200, y: 140 });
    expect(params<{ cornerRadius: number }>(t).cornerRadius).toBeCloseTo(40, 6);
  });

  it('the ellipse end widget turns the ellipse into a pie', () => {
    const t = createTestHost();
    const tool = createSelectionTool();
    const e = t.add(createEllipse(t.ids, 200, 200));
    t.session.select(selectOnly(t.spaceId(), [e.id]));
    drag(tool, t, { x: 200, y: 100 }, { x: 100, y: 200 }); // end handle to the bottom: 90°
    expect(params<{ startAngle: number; endAngle: number }>(t)).toMatchObject({ startAngle: 0, endAngle: 90 });
    drag(tool, t, { x: 200, y: 100 }, { x: 100, y: 0 }); // start handle to the top: 270°
    const p = params<{ startAngle: number; endAngle: number }>(t);
    expect(p.startAngle).toBeCloseTo(270, 6);
    expect(p.endAngle).toBe(90); // the contour wraps: sweep = 90 − 270 + 360
  });

  it('shows no widgets when many objects are selected', () => {
    const t = createTestHost();
    const tool = createSelectionTool();
    const ids = Array.from({ length: 30 }, (_, i) => t.rect(i * 300, 0, 100, 100).id);
    t.session.select(selectOnly(t.spaceId(), ids));
    expect(listWidgets(t.space(), t.session.selection, 1, false)).toHaveLength(120);
    drag(tool, t, { x: 14, y: 14 }, { x: 34, y: 34 }); // the press goes to the normal selection logic: it moves the objects
    expect(params<{ radii: number[] }>(t).radii).toEqual([0, 0, 0, 0]);
    expect(first(t).transform[4]).toBe(20);
  });
});

describe('corner anchors of paths (Direct Selection)', () => {
  const square = (t: TestHost) => t.path([cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: 200, y: 0 }), cornerAnchor({ x: 200, y: 200 }), cornerAnchor({ x: 0, y: 200 })], true);

  it('shows a widget for each picked corner anchor and rounds them all when dragged', () => {
    const t = createTestHost();
    const tool = createDirectSelectionTool();
    const p = square(t);
    t.session.select(withAnchors(selectOnly(t.spaceId(), [p.id]), { [p.id]: [0, 2] }));
    const list = listWidgets(t.space(), t.session.selection, 1, true);
    expect(list.filter((w) => w.kind === 'anchor')).toHaveLength(2);
    const w0 = list.find((w) => w.kind === 'anchor' && w.index === 0)!;
    // Bisector of corner 0 points to (1, 1)/√2; drag 30 along it.
    const to = { x: w0.pos.x + 30 / Math.SQRT2, y: w0.pos.y + 30 / Math.SQRT2 };
    drag(tool, t, w0.pos, to);
    const anchors = (t.space().layers[0]!.children[0] as PathNode).anchors;
    expect(anchors[0]!.cornerRadius).toBeGreaterThan(30);
    expect(anchors[2]!.cornerRadius).toBeCloseTo(anchors[0]!.cornerRadius!, 9);
    expect(anchors[1]!.cornerRadius).toBeUndefined();
    // The geometry shows the rounding: the contour has two more anchors per rounded corner.
    expect(nodeGeometry(t.space().layers[0]!.children[0] as PathNode)!.subpaths[0]!.anchors).toHaveLength(6);
  });

  it('does not offer widgets on smooth anchors or on the ends of an open path', () => {
    const t = createTestHost();
    const p = t.path([cornerAnchor({ x: 0, y: 0 }), { p: { x: 100, y: 0 }, in: { x: 80, y: 0 }, out: { x: 120, y: 0 }, kind: 'smooth' }, cornerAnchor({ x: 200, y: 50 })], false);
    t.session.select(withAnchors(selectOnly(t.spaceId(), [p.id]), { [p.id]: [0, 1, 2] }));
    expect(listWidgets(t.space(), t.session.selection, 1, true)).toEqual([]);
  });
});

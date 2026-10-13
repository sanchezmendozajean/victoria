import { describe, expect, it } from 'vitest';
import { createEllipse, createGroup, createLayer, createPath, createRect, createSpace } from '../model/factory';
import { sequentialIds } from '../model/ids';
import { rotation, scaling, translation } from '../model/matrix';
import type { Anchor, CompoundNode, Layer, Node, ShapeNode, Space, Vec2 } from '../model/types';
import { boundsInParent, nodeGeometry } from './geometry';
import { hitTest, selectionTarget } from './hit-test';
import { flattenGeometry, pointInFill } from './hit';
import { flattenSubPath, segmentBounds, segmentsOf } from './path';
import { indexFor, SpaceIndex } from './spatial-index';
import { shapeSubPaths } from './shapes';

const ids = sequentialIds('g');
const pt = (x: number, y: number): Vec2 => ({ x, y });
const corner = (x: number, y: number): Anchor => ({ p: pt(x, y), in: null, out: null, kind: 'corner' });

function spaceWith(...children: Node[]): Space {
  const layer: Layer = createLayer(ids, 'L');
  layer.children.push(...children);
  return createSpace(ids, { name: 'S', layers: [layer] });
}

function filled(node: Node, fill = true, strokeWidth: number | null = null): Node {
  node.appearance.items = node.appearance.items.filter((i) => (i.kind === 'fill' ? fill : strokeWidth !== null));
  for (const item of node.appearance.items) if (item.kind === 'stroke' && strokeWidth !== null) item.stroke.width = strokeWidth;
  return node;
}

describe('cubic bounds', () => {
  it('finds the true extremes between anchors, not just the control points', () => {
    const bounds = segmentBounds({ p0: pt(0, 0), c1: pt(0, 100), c2: pt(100, 100), p3: pt(100, 0) });
    expect(bounds.minX).toBe(0);
    expect(bounds.maxX).toBe(100);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxY).toBeCloseTo(75, 9); // 0.75 × the control height
  });
});

describe('live shapes', () => {
  it('an ellipse has four smooth anchors and exact bounds', () => {
    const e = filled(createEllipse(ids, 200, 100), true, null) as ShapeNode;
    const [sub] = shapeSubPaths(e);
    expect(sub?.anchors).toHaveLength(4);
    const b = boundsInParent(e);
    expect(b?.minX).toBeCloseTo(0, 9);
    expect(b?.maxX).toBeCloseTo(200, 9);
    expect(b?.maxY).toBeCloseTo(100, 9);
  });

  it('flattening an ellipse stays within tolerance of the true curve', () => {
    const e = createEllipse(ids, 200, 200);
    const [sub] = shapeSubPaths(e);
    const poly = flattenSubPath(sub!, 0.05);
    for (const p of poly.points) expect(Math.abs(Math.hypot(p.x - 100, p.y - 100) - 100)).toBeLessThan(0.06);
  });

  it('a pie slice goes through the centre and covers only its sector', () => {
    const pie = createEllipse(ids, 100, 100) as ShapeNode & { shape: 'ellipse' };
    pie.params.startAngle = 0;
    pie.params.endAngle = 90; // the lower-right quarter (Y points down)
    const g = nodeGeometry(pie)!;
    const flat = flattenGeometry(g, 0.1);
    expect(pointInFill(flat, pt(75, 75), 'nonzero')).toBe(true);
    expect(pointInFill(flat, pt(25, 25), 'nonzero')).toBe(false);
    expect(pointInFill(flat, pt(25, 75), 'nonzero')).toBe(false);
  });

  it('a plain rectangle has four corner anchors', () => {
    const [sub] = shapeSubPaths(createRect(ids, 40, 20));
    expect(sub?.anchors.map((a) => a.p)).toEqual([pt(0, 0), pt(40, 0), pt(40, 20), pt(0, 20)]);
  });

  it('rounds corners with arcs, clamping the radius to half the short side', () => {
    const r = filled(createRect(ids, 100, 40, 999), true, null) as ShapeNode;
    const [sub] = shapeSubPaths(r);
    expect(sub?.anchors).toHaveLength(8);
    expect(boundsInParent(r)).toMatchObject({ minX: 0, minY: 0, maxX: 100, maxY: 40 });
    const flat = flattenGeometry(nodeGeometry(r)!, 0.05);
    expect(pointInFill(flat, pt(0.5, 0.5), 'nonzero')).toBe(false); // the very corner is cut away
    expect(pointInFill(flat, pt(50, 20), 'nonzero')).toBe(true);
    // A radius of 20 on a 40 px high rectangle makes the short sides semicircles.
    expect(pointInFill(flat, pt(20, 20), 'nonzero')).toBe(true);
  });

  it('chamfered corners are straight cuts and inverted ones bite into the shape', () => {
    const chamfer = createRect(ids, 100, 100, 20) as ShapeNode;
    if (chamfer.shape === 'rect') chamfer.params.cornerType = 'chamfer';
    const chamferFlat = flattenGeometry(nodeGeometry(chamfer)!, 0.05);
    expect(pointInFill(chamferFlat, pt(5, 5), 'nonzero')).toBe(false);
    expect(pointInFill(chamferFlat, pt(15, 15), 'nonzero')).toBe(true);
    expect(shapeSubPaths(chamfer)[0]?.anchors.every((a) => a.in === null && a.out === null)).toBe(true);

    const inverted = createRect(ids, 100, 100, 20) as ShapeNode;
    if (inverted.shape === 'rect') inverted.params.cornerType = 'inverted';
    const invertedFlat = flattenGeometry(nodeGeometry(inverted)!, 0.05);
    expect(pointInFill(invertedFlat, pt(3, 3), 'nonzero')).toBe(false);
    expect(pointInFill(invertedFlat, pt(50, 50), 'nonzero')).toBe(true);
  });

  it('polygons and stars are centred on the origin with the first point at the top', () => {
    const polygon: ShapeNode = { ...createRect(ids, 1, 1), shape: 'polygon', params: { radius: 50, sides: 6, cornerRadius: 0 } } as ShapeNode;
    const hexagon = shapeSubPaths(polygon)[0]!;
    expect(hexagon.anchors).toHaveLength(6);
    expect(hexagon.anchors[0]?.p.x).toBeCloseTo(0, 9);
    expect(hexagon.anchors[0]?.p.y).toBeCloseTo(-50, 9);

    const star: ShapeNode = { ...createRect(ids, 1, 1), shape: 'star', params: { r1: 50, r2: 20, points: 5, cornerRadius: 0 } } as ShapeNode;
    const outline = shapeSubPaths(star)[0]!;
    expect(outline.anchors).toHaveLength(10);
    expect(Math.hypot(outline.anchors[1]!.p.x, outline.anchors[1]!.p.y)).toBeCloseTo(20, 9);
  });

  it('a line is an open path along +X', () => {
    const line: ShapeNode = { ...createRect(ids, 1, 1), shape: 'line', params: { length: 80 } } as ShapeNode;
    const [sub] = shapeSubPaths(line);
    expect(sub?.closed).toBe(false);
    expect(segmentsOf(sub!)).toHaveLength(1);
  });
});

describe('bounds', () => {
  it('apply the transform and grow with the stroke', () => {
    const r = filled(createRect(ids, 100, 50), true, 10);
    r.transform = translation(200, 100);
    expect(boundsInParent(r)).toMatchObject({ minX: 195 - 5 * (Math.min(10, 10) - 1), maxX: 305 + 5 * 9 });
  });

  it('a group covers its children in its own space and a clip group only its mask', () => {
    const a = createRect(ids, 10, 10);
    const b = createRect(ids, 10, 10);
    b.transform = translation(100, 0);
    const group = createGroup(ids, [filled(a, true, null), filled(b, true, null)]);
    group.transform = translation(0, 50);
    expect(boundsInParent(group)).toMatchObject({ minX: 0, maxX: 110, minY: 50, maxY: 60 });

    const clip = { ...createGroup(ids, [filled(createRect(ids, 20, 20), true, null), filled(createRect(ids, 500, 500), true, null)]), type: 'clipGroup' as const };
    expect(boundsInParent(clip)).toMatchObject({ maxX: 20, maxY: 20 });
  });

  it('are cached per immutable node', () => {
    const r = createRect(ids, 10, 10);
    expect(boundsInParent(r)).toBe(boundsInParent(r));
  });
});

describe('hit testing', () => {
  const tol = 1;
  const ring = (): CompoundNode => ({
    ...createRect(ids, 1, 1),
    type: 'compound',
    fillRule: 'evenodd',
    children: [
      createPath(ids, [corner(0, 0), corner(100, 0), corner(100, 100), corner(0, 100)], true),
      createPath(ids, [corner(30, 30), corner(70, 30), corner(70, 70), corner(30, 70)], true),
    ],
  }) as unknown as CompoundNode;

  it('hits the fill inside a filled object and nothing outside', () => {
    const r = filled(createRect(ids, 100, 100), true, null);
    const space = spaceWith(r);
    expect(hitTest(space, pt(50, 50), { tolerance: tol })[0]).toMatchObject({ id: r.id, part: 'fill' });
    expect(hitTest(space, pt(150, 50), { tolerance: tol })).toEqual([]);
  });

  it('an object with only a stroke is hit on its outline, not in its interior', () => {
    const r = filled(createRect(ids, 100, 100), false, 4);
    const space = spaceWith(r);
    expect(hitTest(space, pt(50, 50), { tolerance: 0.5 })).toEqual([]);
    expect(hitTest(space, pt(0, 50), { tolerance: 0.5 })[0]).toMatchObject({ part: 'stroke' });
    expect(hitTest(space, pt(1.9, 50), { tolerance: 0.1 })[0]).toMatchObject({ part: 'stroke' });
    expect(hitTest(space, pt(3, 50), { tolerance: 0.1 })).toEqual([]);
  });

  it('thin strokes are still easy to hit thanks to the pick tolerance', () => {
    const r = filled(createRect(ids, 100, 100), false, 0.25);
    const space = spaceWith(r);
    expect(hitTest(space, pt(3, 50), { tolerance: 4 })).toHaveLength(1);
    expect(hitTest(space, pt(10, 50), { tolerance: 4 })).toHaveLength(0);
  });

  it('respects the holes of a compound path (even-odd)', () => {
    const c = ring();
    c.appearance.items = c.appearance.items.filter((i) => i.kind === 'fill');
    const space = spaceWith(c);
    expect(hitTest(space, pt(10, 10), { tolerance: 0.5 })[0]).toMatchObject({ part: 'fill' });
    expect(hitTest(space, pt(50, 50), { tolerance: 0.5 })).toEqual([]); // inside the hole
    expect(hitTest(space, pt(29, 50), { tolerance: 0.5 })[0]).toMatchObject({ part: 'fill' }); // just inside the ring
    expect(hitTest(space, pt(31, 50), { tolerance: 0.5 })).toEqual([]); // just inside the hole
  });

  it('a stroked compound path is hit along the edge of its hole too', () => {
    const c = ring();
    for (const item of c.appearance.items) if (item.kind === 'stroke') item.stroke.width = 2;
    const space = spaceWith(c);
    expect(hitTest(space, pt(50, 50), { tolerance: 0.5 })).toEqual([]);
    expect(hitTest(space, pt(30, 50), { tolerance: 0.5 })[0]).toMatchObject({ part: 'stroke' });
  });

  it('non-zero fill rule fills a hole drawn in the same direction', () => {
    const c = ring();
    c.fillRule = 'nonzero';
    c.appearance.items = c.appearance.items.filter((i) => i.kind === 'fill');
    expect(hitTest(spaceWith(c), pt(50, 50), { tolerance: 0.5 })).toHaveLength(1);
  });

  it('follows rotation and scale of the object and its groups', () => {
    const r = filled(createRect(ids, 100, 10), true, null);
    r.transform = rotation(Math.PI / 2); // now 10 wide, 100 tall, hanging to the left of x = 0
    const space = spaceWith(r);
    expect(hitTest(space, pt(-5, 50), { tolerance: 0.1 })).toHaveLength(1);
    expect(hitTest(space, pt(50, 5), { tolerance: 0.1 })).toHaveLength(0);

    const inner = filled(createRect(ids, 10, 10), true, null);
    const group = createGroup(ids, [inner]);
    group.transform = scaling(10, 10);
    expect(hitTest(spaceWith(group), pt(95, 95), { tolerance: 0.1 })).toHaveLength(1);
    expect(hitTest(spaceWith(group), pt(105, 95), { tolerance: 0.1 })).toHaveLength(0);
  });

  it('scales the pick tolerance with the object scale', () => {
    const r = filled(createRect(ids, 10, 10), false, 1);
    r.transform = scaling(10, 10); // visually 100 × 100 with a 10 px stroke
    expect(hitTest(spaceWith(r), pt(-4, 50), { tolerance: 0.1 })).toHaveLength(1);
    expect(hitTest(spaceWith(r), pt(-6, 50), { tolerance: 0.1 })).toHaveLength(0);
  });

  it('returns hits topmost first and reports the containing groups', () => {
    const below = filled(createRect(ids, 100, 100), true, null);
    const above = filled(createRect(ids, 100, 100), true, null);
    const inner = filled(createRect(ids, 100, 100), true, null);
    const group = createGroup(ids, [inner]);
    const space = spaceWith(below, above, group);
    const hits = hitTest(space, pt(50, 50), { tolerance: 1 });
    expect(hits.map((h) => h.id)).toEqual([inner.id, above.id, below.id]);
    expect(hits[0]?.ancestors.map((n) => n.id)).toEqual([group.id]);
    expect(selectionTarget(hits[0]!)?.id).toBe(group.id);
    expect(selectionTarget(hits[1]!)?.id).toBe(above.id);
  });

  it('skips hidden objects, hidden layers and (by default) locked ones', () => {
    const shown = filled(createRect(ids, 100, 100), true, null);
    const hidden = filled(createRect(ids, 100, 100), true, null);
    hidden.visible = false;
    const locked = filled(createRect(ids, 100, 100), true, null);
    locked.locked = true;
    const space = spaceWith(shown, hidden, locked);
    expect(hitTest(space, pt(50, 50), { tolerance: 1 }).map((h) => h.id)).toEqual([shown.id]);
    expect(hitTest(space, pt(50, 50), { tolerance: 1, includeLocked: true }).map((h) => h.id)).toEqual([locked.id, shown.id]);

    const hiddenLayer = spaceWith(filled(createRect(ids, 100, 100), true, null));
    hiddenLayer.layers[0]!.visible = false;
    expect(hitTest(hiddenLayer, pt(50, 50), { tolerance: 1 })).toEqual([]);
    const lockedLayer = spaceWith(filled(createRect(ids, 100, 100), true, null));
    lockedLayer.layers[0]!.locked = true;
    expect(hitTest(lockedLayer, pt(50, 50), { tolerance: 1 })).toEqual([]);
  });

  it('finds objects inside sublayers', () => {
    const rect = filled(createRect(ids, 100, 100), true, null);
    const sub = createLayer(ids, 'Sub');
    sub.children.push(rect);
    const space = spaceWith();
    space.layers[0]!.children.push(sub);
    expect(hitTest(space, pt(50, 50), { tolerance: 1 })[0]?.layer.id).toBe(sub.id);
    const hiddenSub = { ...sub, visible: false };
    const hiddenSpace = spaceWith();
    hiddenSpace.layers[0]!.children.push(hiddenSub);
    expect(hitTest(hiddenSpace, pt(50, 50), { tolerance: 1 })).toEqual([]);
  });

  it('a clip group can only be hit where its mask is', () => {
    const mask = filled(createRect(ids, 50, 50), true, null);
    const content = filled(createRect(ids, 200, 200), true, null);
    const clip = { ...createGroup(ids, [mask, content]), type: 'clipGroup' as const };
    const space = spaceWith(clip);
    expect(hitTest(space, pt(25, 25), { tolerance: 0.5 })[0]?.id).toBe(content.id);
    expect(hitTest(space, pt(100, 100), { tolerance: 0.5 })).toEqual([]);
  });

  it('stroke alignment: inside strokes are only hit inside, outside strokes only outside', () => {
    const inside = filled(createRect(ids, 100, 100), false, 10);
    for (const i of inside.appearance.items) if (i.kind === 'stroke') i.stroke.align = 'inside';
    const space = spaceWith(inside);
    expect(hitTest(space, pt(5, 50), { tolerance: 0.1 })).toHaveLength(1);
    expect(hitTest(space, pt(-5, 50), { tolerance: 0.1 })).toHaveLength(0);

    const outside = filled(createRect(ids, 100, 100), false, 10);
    for (const i of outside.appearance.items) if (i.kind === 'stroke') i.stroke.align = 'outside';
    const space2 = spaceWith(outside);
    expect(hitTest(space2, pt(-5, 50), { tolerance: 0.1 })).toHaveLength(1);
    expect(hitTest(space2, pt(5, 50), { tolerance: 0.1 })).toHaveLength(0);
  });

  it('an open path fills implicitly and its outline is hit along the stroke', () => {
    const open = createPath(ids, [corner(0, 0), corner(100, 0), corner(100, 100)], false);
    const space = spaceWith(open);
    expect(hitTest(space, pt(100, 50), { tolerance: 0.5 })[0]).toMatchObject({ part: 'stroke' });
    expect(hitTest(space, pt(0, 50), { tolerance: 0.5 })).toEqual([]); // the missing closing edge is not stroked
  });
});

describe('spatial index', () => {
  it('is built once per immutable Space and answers rectangle queries', () => {
    const a = filled(createRect(ids, 10, 10), true, null);
    const b = filled(createRect(ids, 10, 10), true, null);
    b.transform = translation(1000, 1000);
    const space = spaceWith(a, b);
    expect(indexFor(space)).toBe(indexFor(space));
    const near = indexFor(space).search({ minX: -5, minY: -5, maxX: 20, maxY: 20 });
    expect(near.map((i) => i.id)).toEqual([a.id]);
    expect(new SpaceIndex(space).items).toHaveLength(2);
  });

  it('hit testing 10 000 objects stays under 2 ms on average (specs/01 · Rendimiento)', () => {
    const nodes: Node[] = [];
    for (let i = 0; i < 10_000; i++) {
      const r = filled(i % 3 === 0 ? createEllipse(ids, 18, 18) : createRect(ids, 18, 18, 3), true, 1);
      r.transform = translation((i % 100) * 20, Math.floor(i / 100) * 20);
      nodes.push(r);
    }
    const space = spaceWith(...nodes);
    const buildStart = performance.now();
    indexFor(space);
    const build = performance.now() - buildStart;

    const runs = 2000;
    const start = performance.now();
    let hits = 0;
    for (let i = 0; i < runs; i++) hits += hitTest(space, pt((i * 37) % 2000, (i * 91) % 2000), { tolerance: 2 }).length;
    const average = (performance.now() - start) / runs;
    expect(hits).toBeGreaterThan(0);
    expect(average).toBeLessThan(2);
    expect(build).toBeLessThan(500);
  });
});

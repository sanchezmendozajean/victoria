import { describe, expect, it } from 'vitest';
import {
  addNode,
  applyToPoint,
  createDocument,
  createGroup,
  createRect,
  createText,
  distortNodes,
  DocumentSession,
  frameOf,
  getActiveSpace,
  groupNodes,
  isDistortable,
  multiply,
  quadMapper,
  rectQuad,
  sequentialIds,
  translation,
  type PathNode,
  type Quad,
  type Rect,
  type GroupNode,
} from '..';

const box: Rect = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('quadMapper', () => {
  const corners = (q: Quad) => [q.nw, q.ne, q.se, q.sw];
  const trapezoid: Quad = { nw: { x: 25, y: 0 }, ne: { x: 75, y: 0 }, se: { x: 100, y: 100 }, sw: { x: 0, y: 100 } };
  const skewed: Quad = { nw: { x: 10, y: 5 }, ne: { x: 120, y: -20 }, se: { x: 90, y: 130 }, sw: { x: -15, y: 80 } };

  it.each(['free', 'perspective'] as const)('%s: the box corners land exactly on the quad corners', (mode) => {
    const map = quadMapper(box, skewed, mode)!;
    const from = corners(rectQuad(box));
    corners(skewed).forEach((target, i) => near(map(from[i]!), target));
  });

  it.each(['free', 'perspective'] as const)('%s: an unchanged box maps every point to itself', (mode) => {
    const map = quadMapper(box, rectQuad(box), mode)!;
    for (const p of [{ x: 0, y: 0 }, { x: 33, y: 71 }, { x: 100, y: 100 }, { x: 50, y: 50 }]) near(map(p), p);
  });

  it('free distort is bilinear: the centre is the average of the corners', () => {
    const map = quadMapper(box, skewed, 'free')!;
    const q = skewed;
    near(map({ x: 50, y: 50 }), { x: (q.nw.x + q.ne.x + q.se.x + q.sw.x) / 4, y: (q.nw.y + q.ne.y + q.se.y + q.sw.y) / 4 });
  });

  it('perspective keeps straight lines straight and foreshortens: the middle of a trapezoid is not halfway', () => {
    const map = quadMapper(box, trapezoid, 'perspective')!;
    // Points on the left edge stay on the left edge line (25,0)→(0,100).
    for (const y of [0, 25, 60, 100]) {
      const p = map({ x: 0, y });
      expect(p.x).toBeCloseTo(25 - (25 * p.y) / 100, 6);
    }
    // The horizontal centre line of the box lands above the average height of the trapezoid (farther = smaller).
    const centre = map({ x: 50, y: 50 });
    const bilinear = quadMapper(box, trapezoid, 'free')!({ x: 50, y: 50 });
    expect(centre.x).toBeCloseTo(50, 6);
    expect(centre.y).not.toBeCloseTo(bilinear.y, 1);
  });

  it('perspective of a parallelogram is the affine map (no division)', () => {
    const parallelogram: Quad = { nw: { x: 20, y: 0 }, ne: { x: 120, y: 0 }, se: { x: 100, y: 100 }, sw: { x: 0, y: 100 } };
    const map = quadMapper(box, parallelogram, 'perspective')!;
    near(map({ x: 50, y: 50 }), { x: 60, y: 50 });
    near(map({ x: 100, y: 0 }), { x: 120, y: 0 });
  });

  it('refuses an empty box and never returns NaN, even past the vanishing line', () => {
    expect(quadMapper({ minX: 0, minY: 0, maxX: 0, maxY: 50 }, rectQuad(box), 'free')).toBeNull();
    const pinched: Quad = { nw: { x: 49, y: 0 }, ne: { x: 51, y: 0 }, se: { x: 100, y: 100 }, sw: { x: 0, y: 100 } };
    const map = quadMapper(box, pinched, 'perspective')!;
    for (const p of [{ x: 50, y: 200 }, { x: -300, y: 400 }, { x: 0, y: 1000 }]) {
      const out = map(p);
      expect(Number.isFinite(out.x) && Number.isFinite(out.y)).toBe(true);
    }
  });
});

describe('distortNodes', () => {
  function setup() {
    const ids = sequentialIds('d');
    const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
    const session = new DocumentSession(doc, { ids });
    const space = () => getActiveSpace(session.document);
    const add = (node: Parameters<typeof addNode>[2]) => session.run(addNode(space().id, space().layers[0]!.id, node));
    return { ids, session, space, add };
  }
  const quad: Quad = { nw: { x: 20, y: 10 }, ne: { x: 140, y: 30 }, se: { x: 130, y: 90 }, sw: { x: 0, y: 60 } };

  it('turns a live rectangle into a path whose corners sit on the quad, keeping id and order', () => {
    const s = setup();
    const r = createRect(s.ids, 100, 50);
    r.transform = translation(10, 10);
    s.add(r);
    const bounds = { minX: 10, minY: 10, maxX: 110, maxY: 60 };
    const q: Quad = { nw: { x: 20, y: 10 }, ne: { x: 140, y: 30 }, se: { x: 130, y: 90 }, sw: { x: 0, y: 60 } };
    const [out] = distortNodes(s.space(), [r.id], quadMapper(bounds, q, 'free')!)!;
    expect(out!.id).toBe(r.id);
    expect(out!.type).toBe('path');
    const path = out as PathNode;
    const world = path.anchors.map((a) => applyToPoint(multiply([1, 0, 0, 1, 0, 0], path.transform), a.p));
    [q.nw, q.ne, q.se, q.sw].forEach((target, i) => near(world[i]!, target));
    expect(path.closed).toBe(true);
  });

  it('resolves live corners into plain anchors', () => {
    const s = setup();
    const r = createRect(s.ids, 100, 100, 20);
    s.add(r);
    const [out] = distortNodes(s.space(), [r.id], quadMapper(box, rectQuad(box), 'free')!)!;
    const path = out as PathNode;
    expect(path.anchors.length).toBeGreaterThan(4);
    expect(path.anchors.every((a) => a.cornerRadius === undefined)).toBe(true);
  });

  it('goes inside groups, honouring their transforms', () => {
    const s = setup();
    const r = createRect(s.ids, 100, 100);
    s.add(r);
    const group = createGroup(s.ids, []);
    s.session.run(groupNodes(s.space().id, [r.id], group));
    s.session.run({ label: 'move', apply: (d) => void ((d.spaces[0]!.layers[0]!.children[0] as unknown as { transform: number[] }).transform = [1, 0, 0, 1, 200, 0]) });
    const map = quadMapper({ minX: 200, minY: 0, maxX: 300, maxY: 100 }, { nw: { x: 200, y: 0 }, ne: { x: 400, y: 0 }, se: { x: 400, y: 100 }, sw: { x: 200, y: 100 } }, 'free')!;
    const [out] = distortNodes(s.space(), [group.id], map)!;
    const moved = out as GroupNode;
    const child = moved.children[0] as PathNode;
    const frame = (p: { x: number; y: number }) => applyToPoint(multiply(moved.transform, child.transform), p);
    near(frame(child.anchors[1]!.p), { x: 400, y: 0 }); // the right edge doubled in width
    near(frame(child.anchors[0]!.p), { x: 200, y: 0 });
  });

  it('cannot distort text or images, and says so', () => {
    const s = setup();
    const r = createRect(s.ids, 10, 10);
    const t = createText(s.ids, { kind: 'point' }, []);
    s.add(r);
    s.add(t);
    expect(isDistortable([r])).toBe(true);
    expect(isDistortable([r, t])).toBe(false);
    expect(isDistortable([])).toBe(false);
    expect(distortNodes(s.space(), [r.id, t.id], quadMapper(box, quad, 'free')!)).toBeNull();
    expect(frameOf(s.space(), r.id)).not.toBeNull();
  });
});

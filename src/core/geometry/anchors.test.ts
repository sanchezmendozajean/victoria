import { describe, expect, it } from 'vitest';
import {
  applyCornerRadii,
  averageAnchors,
  closeOpenPath,
  convertToCorner,
  convertToSmooth,
  cornerAnchor,
  curvatureAnchors,
  cutPath,
  fitCurve,
  insertAnchor,
  joinPaths,
  pointOnSegment,
  removeAnchors,
  segmentsOf,
  simplifyPolyline,
  smoothAnchor,
  type Anchor,
} from '..';

const line = (...pts: Array<[number, number]>): Anchor[] => pts.map(([x, y]) => cornerAnchor({ x, y }));

describe('insertAnchor', () => {
  it('adds a corner on a straight span', () => {
    const r = insertAnchor(line([0, 0], [100, 0]), false, 0, 0.5);
    expect(r.index).toBe(1);
    expect(r.anchors.map((a) => a.p)).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }]);
    expect(r.anchors[1]?.kind).toBe('corner');
  });

  it('keeps a curve exactly when splitting it', () => {
    const anchors = [smoothAnchor({ x: 0, y: 0 }, { x: 0, y: 60 }), smoothAnchor({ x: 100, y: 0 }, { x: 100, y: -60 })];
    anchors[0]!.in = null;
    anchors[1]!.out = null;
    const before = segmentsOf({ anchors, closed: false })[0]!;
    const { anchors: next } = insertAnchor(anchors, false, 0, 0.4);
    const [a, b] = segmentsOf({ anchors: next, closed: false });
    expect(next).toHaveLength(3);
    expect(next[1]?.kind).toBe('smooth');
    for (const t of [0.25, 0.5, 0.9]) {
      const p = pointOnSegment(a!, t);
      const q = pointOnSegment(before, t * 0.4);
      expect(p.x).toBeCloseTo(q.x, 6);
      expect(p.y).toBeCloseTo(q.y, 6);
      const p2 = pointOnSegment(b!, t);
      const q2 = pointOnSegment(before, 0.4 + t * 0.6);
      expect(p2.x).toBeCloseTo(q2.x, 6);
      expect(p2.y).toBeCloseTo(q2.y, 6);
    }
  });

  it('inserts after the last anchor when splitting the closing span', () => {
    const r = insertAnchor(line([0, 0], [100, 0], [100, 100]), true, 2, 0.5);
    expect(r.index).toBe(3);
    expect(r.anchors[3]?.p).toEqual({ x: 50, y: 50 });
  });
});

describe('removeAnchors / convert', () => {
  it('removes anchors and returns null when fewer than two remain', () => {
    expect(removeAnchors(line([0, 0], [1, 0], [2, 0]), [1])).toHaveLength(2);
    expect(removeAnchors(line([0, 0], [1, 0]), [0])).toBeNull();
  });

  it('converts to corner (retracting handles) and to smooth (handles along the neighbours)', () => {
    const smooth = convertToSmooth(line([0, 0], [30, 0], [60, 30]), false, [1]);
    const a = smooth[1]!;
    expect(a.kind).toBe('smooth');
    const cross = (a.p.x - a.in!.x) * (a.out!.y - a.p.y) - (a.p.y - a.in!.y) * (a.out!.x - a.p.x);
    expect(cross).toBeCloseTo(0, 9);
    const back = convertToCorner(smooth, [1])[1]!;
    expect(back.in).toBeNull();
    expect(back.out).toBeNull();
    expect(back.kind).toBe('corner');
  });
});

describe('cutPath (scissors)', () => {
  it('cuts an open path at an inner anchor into two paths sharing the point', () => {
    const [a, b] = cutPath(line([0, 0], [10, 0], [20, 0]), false, { anchor: 1 })!;
    expect(a!.map((x) => x.p.x)).toEqual([0, 10]);
    expect(b!.map((x) => x.p.x)).toEqual([10, 20]);
  });

  it('does nothing on an end anchor of an open path', () => {
    expect(cutPath(line([0, 0], [10, 0]), false, { anchor: 0 })).toBeNull();
  });

  it('opens a closed path at the cut with two coincident ends', () => {
    const result = cutPath(line([0, 0], [10, 0], [10, 10], [0, 10]), true, { anchor: 2 })!;
    expect(result).toHaveLength(1);
    const path = result[0]!;
    expect(path).toHaveLength(5);
    expect(path[0]!.p).toEqual(path[4]!.p);
    expect(path[0]!.p).toEqual({ x: 10, y: 10 });
  });

  it('cuts inside a span by inserting an anchor first', () => {
    const parts = cutPath(line([0, 0], [100, 0]), false, { segment: 0, t: 0.5 })!;
    expect(parts).toHaveLength(2);
    expect(parts[0]!.at(-1)!.p).toEqual({ x: 50, y: 0 });
    expect(parts[1]![0]!.p).toEqual({ x: 50, y: 0 });
  });
});

describe('join / close / average', () => {
  it('joins end to start and welds coincident anchors', () => {
    const joined = joinPaths(line([0, 0], [10, 0]), 'end', line([10, 0], [20, 0]), 'start');
    expect(joined.map((a) => a.p.x)).toEqual([0, 10, 20]);
  });

  it('joins with reversal when the ends face each other', () => {
    const joined = joinPaths(line([0, 0], [10, 0]), 'end', line([30, 0], [20, 0]), 'end');
    expect(joined.map((a) => a.p.x)).toEqual([0, 10, 20, 30]);
  });

  it('swaps handles when reversing', () => {
    const a: Anchor = { p: { x: 5, y: 5 }, in: { x: 1, y: 1 }, out: { x: 9, y: 9 }, kind: 'smooth' };
    const joined = joinPaths([cornerAnchor({ x: 20, y: 20 })], 'end', [a], 'end');
    expect(joined[1]!.in).toEqual({ x: 9, y: 9 });
  });

  it('closes an open path, welding coincident ends', () => {
    expect(closeOpenPath(line([0, 0], [10, 0], [10, 10], [0, 0]))).toHaveLength(3);
  });

  it('averages on an axis or on both', () => {
    const anchors = line([0, 0], [10, 20], [20, 10]);
    expect(averageAnchors(anchors, [0, 1, 2], 'x').map((a) => a.p)).toEqual([
      { x: 10, y: 0 },
      { x: 10, y: 20 },
      { x: 10, y: 10 },
    ]);
    expect(averageAnchors(anchors, [1, 2], 'both').map((a) => a.p)[1]).toEqual({ x: 15, y: 15 });
  });

  it('moves handles together with their anchor when averaging', () => {
    const a: Anchor = { p: { x: 0, y: 0 }, in: null, out: { x: 5, y: 0 }, kind: 'corner' };
    const r = averageAnchors([a, cornerAnchor({ x: 10, y: 0 })], [0, 1], 'x');
    expect(r[0]!.out).toEqual({ x: 10, y: 0 });
  });
});

describe('curvatureAnchors', () => {
  it('passes through every point with collinear handles', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 0 },
      { x: 150, y: 40 },
    ];
    const anchors = curvatureAnchors(pts);
    expect(anchors.map((a) => a.p)).toEqual(pts);
    const mid = anchors[1]!;
    const cross = (mid.p.x - mid.in!.x) * (mid.out!.y - mid.p.y) - (mid.p.y - mid.in!.y) * (mid.out!.x - mid.p.x);
    expect(cross).toBeCloseTo(0, 9);
  });

  it('keeps corners sharp and two points straight', () => {
    expect(curvatureAnchors([{ x: 0, y: 0 }, { x: 10, y: 0 }]).every((a) => !a.in && !a.out)).toBe(true);
    const anchors = curvatureAnchors([{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 0 }], new Set([1]));
    expect(anchors[1]!.kind).toBe('corner');
    expect(anchors[1]!.in).toBeNull();
  });
});

describe('fitCurve (Schneider)', () => {
  it('fits a sampled quarter circle with few anchors within the error', () => {
    const pts = Array.from({ length: 60 }, (_, i) => ({ x: 100 * Math.cos((i / 59) * (Math.PI / 2)), y: 100 * Math.sin((i / 59) * (Math.PI / 2)) }));
    const anchors = fitCurve(pts, 0.5);
    expect(anchors.length).toBeLessThanOrEqual(3);
    const segs = segmentsOf({ anchors, closed: false });
    let worst = 0;
    for (const p of pts) {
      let best = Infinity;
      for (const s of segs) for (let t = 0; t <= 1; t += 0.001) best = Math.min(best, Math.hypot(pointOnSegment(s, t).x - p.x, pointOnSegment(s, t).y - p.y));
      worst = Math.max(worst, best);
    }
    expect(worst).toBeLessThan(1);
  });

  it('turns a straight run into a single span and ignores repeated points', () => {
    const pts = [...Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: 0 })), { x: 95, y: 0 }];
    expect(fitCurve(pts, 1)).toHaveLength(2);
    expect(fitCurve([{ x: 1, y: 1 }, { x: 1, y: 1 }], 1)).toHaveLength(1);
  });

  it('splits sharp turns into more spans', () => {
    const pts = [...Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: 0 })), ...Array.from({ length: 20 }, (_, i) => ({ x: 95, y: (i + 1) * 5 }))];
    expect(fitCurve(pts, 1).length).toBeGreaterThanOrEqual(3);
  });

  it('simplifies polylines', () => {
    expect(simplifyPolyline([{ x: 0, y: 0 }, { x: 5, y: 0.1 }, { x: 10, y: 0 }], 1)).toHaveLength(2);
  });
});

describe('applyCornerRadii (live corners)', () => {
  const square = (r: number): Anchor[] => line([0, 0], [100, 0], [100, 100], [0, 100]).map((a) => ({ ...a, cornerRadius: r }));

  it('rounds every corner of a closed path into two anchors', () => {
    const rounded = applyCornerRadii({ anchors: square(10), closed: true });
    expect(rounded.anchors).toHaveLength(8);
    const near = (x: number, y: number) => rounded.anchors.some((a) => Math.abs(a.p.x - x) < 1e-9 && Math.abs(a.p.y - y) < 1e-9);
    expect(near(10, 0)).toBe(true);
    expect(near(0, 10)).toBe(true);
  });

  it('leaves the ends of an open path and anchors with handles alone', () => {
    const open = applyCornerRadii({ anchors: square(10).slice(0, 3), closed: false });
    expect(open.anchors).toHaveLength(4);
    const withHandle = square(10);
    withHandle[1] = { ...withHandle[1]!, out: { x: 110, y: 0 } };
    expect(applyCornerRadii({ anchors: withHandle, closed: true }).anchors.length).toBeLessThan(8);
  });

  it('clamps the radius to half of the shorter neighbouring span', () => {
    const rounded = applyCornerRadii({ anchors: square(500), closed: true });
    expect(rounded.anchors.every((a) => a.p.x >= 0 && a.p.x <= 100 && a.p.y >= 0 && a.p.y <= 100)).toBe(true);
  });

  it('returns the same contour when no anchor has a radius', () => {
    const sub = { anchors: line([0, 0], [1, 1]), closed: false };
    expect(applyCornerRadii(sub)).toBe(sub);
  });
});

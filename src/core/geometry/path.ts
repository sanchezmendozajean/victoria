import type { Anchor, Vec2 } from '../model/types';
import { rectFromPoints, unionRect, type Rect } from './rect';

/** Anchors of one contour. Open contours are not closed implicitly for stroking, but are for filling. */
export interface SubPath {
  anchors: Anchor[];
  closed: boolean;
}

/** One cubic Bézier span between two consecutive anchors (straight when handles are retracted). */
export interface Segment {
  p0: Vec2;
  c1: Vec2;
  c2: Vec2;
  p3: Vec2;
}

export function segmentsOf(sub: SubPath): Segment[] {
  const { anchors, closed } = sub;
  const count = closed ? anchors.length : anchors.length - 1;
  const out: Segment[] = [];
  for (let i = 0; i < count; i++) {
    const a = anchors[i] as Anchor;
    const b = anchors[(i + 1) % anchors.length] as Anchor;
    out.push({ p0: a.p, c1: a.out ?? a.p, c2: b.in ?? b.p, p3: b.p });
  }
  return out;
}

/** Appends the flattened span to `out` (without its first point). `tolerance` is the max chord error. */
export function flattenSegment(seg: Segment, tolerance: number, out: Vec2[]): void {
  const stack: Array<{ s: Segment; depth: number }> = [{ s: seg, depth: 0 }];
  while (stack.length > 0) {
    const { s, depth } = stack.pop() as { s: Segment; depth: number };
    if (depth >= 16 || isFlat(s, tolerance)) {
      out.push(s.p3);
      continue;
    }
    const [left, right] = splitSegment(s, 0.5);
    stack.push({ s: right, depth: depth + 1 }, { s: left, depth: depth + 1 });
  }
}

function isFlat(s: Segment, tolerance: number): boolean {
  const dx = s.p3.x - s.p0.x;
  const dy = s.p3.y - s.p0.y;
  const len = Math.hypot(dx, dy);
  const d1 = len === 0 ? Math.hypot(s.c1.x - s.p0.x, s.c1.y - s.p0.y) : Math.abs((s.c1.x - s.p0.x) * dy - (s.c1.y - s.p0.y) * dx) / len;
  const d2 = len === 0 ? Math.hypot(s.c2.x - s.p0.x, s.c2.y - s.p0.y) : Math.abs((s.c2.x - s.p0.x) * dy - (s.c2.y - s.p0.y) * dx) / len;
  return Math.max(d1, d2) <= tolerance;
}

const mid = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** De Casteljau split. */
export function splitSegment(s: Segment, t: number): [Segment, Segment] {
  const ab = mid(s.p0, s.c1, t);
  const bc = mid(s.c1, s.c2, t);
  const cd = mid(s.c2, s.p3, t);
  const abc = mid(ab, bc, t);
  const bcd = mid(bc, cd, t);
  const m = mid(abc, bcd, t);
  return [
    { p0: s.p0, c1: ab, c2: abc, p3: m },
    { p0: m, c1: bcd, c2: cd, p3: s.p3 },
  ];
}

export interface Polyline {
  points: Vec2[];
  closed: boolean;
}

export function flattenSubPath(sub: SubPath, tolerance: number): Polyline {
  const first = sub.anchors[0];
  if (!first) return { points: [], closed: sub.closed };
  const points: Vec2[] = [first.p];
  for (const seg of segmentsOf(sub)) flattenSegment(seg, tolerance, points);
  // A closed contour ends where it started; keep the polyline open-ended so edges are not doubled.
  if (sub.closed && points.length > 1) {
    const last = points[points.length - 1] as Vec2;
    if (last.x === first.p.x && last.y === first.p.y) points.pop();
  }
  return { points, closed: sub.closed };
}

/** Roots of a·t² + b·t + c in (0, 1). */
function rootsInUnit(a: number, b: number, c: number): number[] {
  const eps = 1e-12;
  if (Math.abs(a) < eps) {
    if (Math.abs(b) < eps) return [];
    const t = -c / b;
    return t > 0 && t < 1 ? [t] : [];
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const sq = Math.sqrt(disc);
  return [(-b + sq) / (2 * a), (-b - sq) / (2 * a)].filter((t) => t > 0 && t < 1);
}

function axisExtrema(p0: number, c1: number, c2: number, p3: number): number[] {
  const a = -p0 + 3 * c1 - 3 * c2 + p3;
  const b = 2 * (p0 - 2 * c1 + c2);
  const c = c1 - p0;
  return rootsInUnit(a, b, c);
}

export function pointOnSegment(s: Segment, t: number): Vec2 {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * s.p0.x + w1 * s.c1.x + w2 * s.c2.x + w3 * s.p3.x,
    y: w0 * s.p0.y + w1 * s.c1.y + w2 * s.c2.y + w3 * s.p3.y,
  };
}

/** Exact bounding box of a cubic span (endpoints plus the extrema of each axis). */
export function segmentBounds(s: Segment): Rect {
  const ts = [...axisExtrema(s.p0.x, s.c1.x, s.c2.x, s.p3.x), ...axisExtrema(s.p0.y, s.c1.y, s.c2.y, s.p3.y)];
  return rectFromPoints([s.p0, s.p3, ...ts.map((t) => pointOnSegment(s, t))]) as Rect;
}

export function subPathBounds(sub: SubPath): Rect | null {
  const segs = segmentsOf(sub);
  if (segs.length === 0) return sub.anchors[0] ? rectFromPoints([sub.anchors[0].p]) : null;
  let rect: Rect | null = null;
  for (const seg of segs) rect = unionRect(rect, segmentBounds(seg));
  return rect;
}

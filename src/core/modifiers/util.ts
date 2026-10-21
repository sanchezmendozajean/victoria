import { curvatureAnchors } from '../geometry/anchors';
import { fitCurve } from '../geometry/fit';
import { flattenSubPath, splitSegment, segmentsOf, type SubPath } from '../geometry/path';
import { rectCenter } from '../geometry/world';
import type { Anchor, Vec2 } from '../model/types';
import type { Geometry } from './types';

export const num = (params: { [key: string]: unknown }, key: string, fallback: number): number => (typeof params[key] === 'number' ? (params[key] as number) : fallback);

/** Mulberry32: a tiny seeded generator (modifiers must be deterministic). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const cloneAnchor = (a: Anchor): Anchor => ({ ...a, p: { ...a.p }, in: a.in && { ...a.in }, out: a.out && { ...a.out } });
export const cloneGeometry = (g: Geometry): Geometry => ({ fillRule: g.fillRule, subpaths: g.subpaths.map((s) => ({ closed: s.closed, anchors: s.anchors.map(cloneAnchor) })) });

/** Applies a point mapping to anchors and handles. */
export function mapGeometry(g: Geometry, map: (p: Vec2) => Vec2): Geometry {
  return {
    fillRule: g.fillRule,
    subpaths: g.subpaths.map((s) => ({ closed: s.closed, anchors: s.anchors.map((a) => ({ ...a, p: map(a.p), in: a.in && map(a.in), out: a.out && map(a.out) })) })),
  };
}

export function boundsOfGeometry(g: Geometry): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let b: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  for (const s of g.subpaths) {
    for (const seg of segmentsOf(s)) {
      for (const p of [seg.p0, seg.c1, seg.c2, seg.p3]) {
        b = b ? { minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) } : { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
      }
    }
    if (s.anchors.length === 1 && !b) b = { minX: s.anchors[0]!.p.x, minY: s.anchors[0]!.p.y, maxX: s.anchors[0]!.p.x, maxY: s.anchors[0]!.p.y };
  }
  return b;
}

export const centerOf = (g: Geometry): Vec2 => {
  const b = boundsOfGeometry(g);
  return b ? rectCenter(b) : { x: 0, y: 0 };
};

/** Splits every span into `parts` equal-parameter spans (so a point mapping bends curves smoothly). */
export function subdivide(g: Geometry, parts: number): Geometry {
  if (parts <= 1) return g;
  const same = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;
  return {
    fillRule: g.fillRule,
    subpaths: g.subpaths.map((sub) => {
      const segs = segmentsOf(sub);
      if (segs.length === 0) return sub;
      const src = sub.anchors;
      const out: Anchor[] = [{ ...cloneAnchor(src[0] as Anchor), out: null }];
      segs.forEach((seg, i) => {
        const pieces: Array<ReturnType<typeof splitSegment>[0]> = [];
        let rest = seg;
        for (let k = parts; k > 1; k--) {
          const [head, tail] = splitSegment(rest, 1 / k);
          pieces.push(head);
          rest = tail;
        }
        pieces.push(rest);
        pieces.forEach((piece, k) => {
          const from = out[out.length - 1] as Anchor;
          from.out = same(piece.c1, piece.p0) ? null : { ...piece.c1 };
          const incoming = same(piece.c2, piece.p3) ? null : { ...piece.c2 };
          if (k < pieces.length - 1) out.push({ p: { ...piece.p3 }, in: incoming, out: null, kind: 'smooth' });
          else if (sub.closed && i === segs.length - 1) (out[0] as Anchor).in = incoming;
          else out.push({ ...cloneAnchor(src[i + 1] as Anchor), in: incoming, out: null });
        });
      });
      return { closed: sub.closed, anchors: out };
    }),
  };
}

/** Unit normal (pointing to the right of the direction of travel) of a span at t. */
export function normalAt(seg: { p0: Vec2; c1: Vec2; c2: Vec2; p3: Vec2 }, t: number): Vec2 {
  const u = 1 - t;
  const dx = 3 * u * u * (seg.c1.x - seg.p0.x) + 6 * u * t * (seg.c2.x - seg.c1.x) + 3 * t * t * (seg.p3.x - seg.c2.x);
  const dy = 3 * u * u * (seg.c1.y - seg.p0.y) + 6 * u * t * (seg.c2.y - seg.c1.y) + 3 * t * t * (seg.p3.y - seg.c2.y);
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

/** A polyline as anchors: smooth ones get handles from their neighbours; corners stay sharp. */
export function polylineAnchors(points: readonly Vec2[], corners: ReadonlySet<number>, closed: boolean, smooth: boolean): Anchor[] {
  if (!smooth) return points.map((p) => ({ p: { ...p }, in: null, out: null, kind: 'corner' as const }));
  return curvatureAnchors(points, corners, closed);
}

const turn = (a: Vec2, b: Vec2, c: Vec2): number => {
  const v1 = { x: b.x - a.x, y: b.y - a.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const l = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (l === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / l)));
};

const isLine = (a: Anchor, b: Anchor, error: number): boolean => {
  const dx = b.p.x - a.p.x;
  const dy = b.p.y - a.p.y;
  const len = Math.hypot(dx, dy) || 1;
  const off = (p: Vec2 | null) => (p ? Math.abs((p.x - a.p.x) * dy - (p.y - a.p.y) * dx) / len : 0);
  return off(a.out) < error && off(b.in) < error;
};

/**
 * Fits a flattened closed polygon back to Béziers: sharp turns stay corners, the stretches between them
 * are fitted with `fitCurve`, and straight stretches collapse to plain lines.
 */
export function fitPolygon(points: readonly Vec2[], tolerance: number, cornerAngle = 0.6): Anchor[] {
  const pts = points.filter((p, i) => i === 0 || Math.hypot(p.x - (points[i - 1] as Vec2).x, p.y - (points[i - 1] as Vec2).y) > 1e-9);
  if (pts.length > 1 && Math.hypot((pts[0] as Vec2).x - (pts[pts.length - 1] as Vec2).x, (pts[0] as Vec2).y - (pts[pts.length - 1] as Vec2).y) < 1e-9) pts.pop();
  const n = pts.length;
  if (n < 3) return pts.map((p) => ({ p: { ...p }, in: null, out: null, kind: 'corner' as const }));
  const corners: number[] = [];
  for (let i = 0; i < n; i++) if (turn(pts[(i - 1 + n) % n] as Vec2, pts[i] as Vec2, pts[(i + 1) % n] as Vec2) > cornerAngle) corners.push(i);
  const starts = corners.length > 0 ? corners : [0, Math.floor(n / 2)];
  const runs: Anchor[][] = starts.map((start, k) => {
    const end = starts[(k + 1) % starts.length] as number;
    const run: Vec2[] = [];
    for (let i = start; run.length <= n + 1; i = (i + 1) % n) {
      run.push(pts[i] as Vec2);
      if (i === end && run.length > 1) break;
    }
    const fitted = fitCurve(run, tolerance);
    for (let i = 0; i < fitted.length - 1; i++) {
      const p = fitted[i] as Anchor;
      const q = fitted[i + 1] as Anchor;
      if (isLine(p, q, tolerance * 0.5)) {
        p.out = null;
        q.in = null;
      }
    }
    return fitted;
  });
  const anchors: Anchor[] = [];
  const firstOf: number[] = [];
  runs.forEach((fitted) => {
    firstOf.push(anchors.length);
    for (let i = 0; i < fitted.length - 1; i++) anchors.push(fitted[i] as Anchor);
  });
  // Where a run ends, the next run starts on the same point: it inherits the incoming handle.
  runs.forEach((fitted, k) => {
    const next = anchors[firstOf[(k + 1) % runs.length] as number] as Anchor;
    next.in = (fitted[fitted.length - 1] as Anchor).in;
    if (corners.length === 0) next.kind = 'smooth';
  });
  return anchors;
}

export const flatten = (s: SubPath, tolerance = 0.05): Vec2[] => flattenSubPath(s, tolerance).points;

import type { Anchor, Vec2 } from '../model/types';

// Schneider's curve fitting ("An Algorithm for Automatically Fitting Digitized Curves", Graphics
// Gems, 1990): turns a dense polyline into few cubic Béziers within `error`. Used by the Pencil.

type Bezier = [Vec2, Vec2, Vec2, Vec2];

const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const norm = (a: Vec2): Vec2 => {
  const l = Math.hypot(a.x, a.y);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};

function bezierAt(b: Bezier, t: number): Vec2 {
  const u = 1 - t;
  return add(add(scale(b[0], u * u * u), scale(b[1], 3 * u * u * t)), add(scale(b[2], 3 * u * t * t), scale(b[3], t * t * t)));
}
function firstDerivative(b: Bezier, t: number): Vec2 {
  const u = 1 - t;
  return add(add(scale(sub(b[1], b[0]), 3 * u * u), scale(sub(b[2], b[1]), 6 * u * t)), scale(sub(b[3], b[2]), 3 * t * t));
}
function secondDerivative(b: Bezier, t: number): Vec2 {
  const u = 1 - t;
  return add(scale(add(sub(b[2], scale(b[1], 2)), b[0]), 6 * u), scale(add(sub(b[3], scale(b[2], 2)), b[1]), 6 * t));
}

function chordLengths(points: readonly Vec2[]): number[] {
  const u = [0];
  for (let i = 1; i < points.length; i++) u.push((u[i - 1] as number) + dist(points[i] as Vec2, points[i - 1] as Vec2));
  const total = u[u.length - 1] as number;
  return u.map((v) => (total === 0 ? 0 : v / total));
}

function generateBezier(points: readonly Vec2[], u: readonly number[], tan1: Vec2, tan2: Vec2): Bezier {
  const first = points[0] as Vec2;
  const last = points[points.length - 1] as Vec2;
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < points.length; i++) {
    const t = u[i] as number;
    const m = 1 - t;
    const b0 = m * m * m;
    const b1 = 3 * t * m * m;
    const b2 = 3 * t * t * m;
    const b3 = t * t * t;
    const a1 = scale(tan1, b1);
    const a2 = scale(tan2, b2);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const tmp = sub(points[i] as Vec2, add(scale(first, b0 + b1), scale(last, b2 + b3)));
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  const segmentLength = dist(first, last);
  const eps = 1e-6 * segmentLength;
  let alpha1: number;
  let alpha2: number;
  if (Math.abs(det) > 1e-12) {
    alpha1 = (x0 * c11 - x1 * c01) / det;
    alpha2 = (c00 * x1 - c01 * x0) / det;
  } else {
    alpha1 = alpha2 = segmentLength / 3;
  }
  // Degenerate or backwards handles: fall back to the Wu/Barsky heuristic (a third of the chord).
  if (alpha1 < eps || alpha2 < eps) alpha1 = alpha2 = segmentLength / 3;
  return [first, add(first, scale(tan1, alpha1)), add(last, scale(tan2, alpha2)), last];
}

function reparameterize(bezier: Bezier, points: readonly Vec2[], u: readonly number[]): number[] {
  return u.map((t, i) => {
    const d = sub(bezierAt(bezier, t), points[i] as Vec2);
    const d1 = firstDerivative(bezier, t);
    const d2 = secondDerivative(bezier, t);
    const numerator = dot(d, d1);
    const denominator = dot(d1, d1) + dot(d, d2);
    return Math.abs(denominator) < 1e-12 ? t : Math.min(1, Math.max(0, t - numerator / denominator));
  });
}

function maxError(points: readonly Vec2[], bezier: Bezier, u: readonly number[]): { error: number; index: number } {
  let worst = 0;
  let index = Math.floor(points.length / 2);
  for (let i = 1; i < points.length - 1; i++) {
    const d = dist(bezierAt(bezier, u[i] as number), points[i] as Vec2);
    if (d >= worst) {
      worst = d;
      index = i;
    }
  }
  return { error: worst, index };
}

function fitCubic(points: readonly Vec2[], tan1: Vec2, tan2: Vec2, error: number, out: Bezier[]): void {
  if (points.length === 2) {
    const a = points[0] as Vec2;
    const b = points[1] as Vec2;
    const d = dist(a, b) / 3;
    out.push([a, add(a, scale(tan1, d)), add(b, scale(tan2, d)), b]);
    return;
  }
  let u = chordLengths(points);
  let bezier = generateBezier(points, u, tan1, tan2);
  let { error: worst, index: split } = maxError(points, bezier, u);
  if (worst < error) {
    out.push(bezier);
    return;
  }
  if (worst < error * error * 16) {
    for (let i = 0; i < 4; i++) {
      u = reparameterize(bezier, points, u);
      bezier = generateBezier(points, u, tan1, tan2);
      ({ error: worst, index: split } = maxError(points, bezier, u));
      if (worst < error) {
        out.push(bezier);
        return;
      }
    }
  }
  split = Math.min(points.length - 2, Math.max(1, split));
  const centre = norm(sub(points[split - 1] as Vec2, points[split + 1] as Vec2));
  fitCubic(points.slice(0, split + 1), tan1, centre, error, out);
  fitCubic(points.slice(split), scale(centre, -1), tan2, error, out);
}

/** Drops consecutive points closer than `epsilon`. */
export function dedupePoints(points: readonly Vec2[], epsilon = 1e-9): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) > epsilon) out.push(p);
  }
  return out;
}

/**
 * Fits a polyline with cubic Béziers whose maximum deviation is about `error` (same unit as the points).
 * Ends are corners; joins between fitted spans are smooth (tangent continuous by construction).
 */
export function fitCurve(input: readonly Vec2[], error: number): Anchor[] {
  const points = dedupePoints(input);
  if (points.length === 0) return [];
  if (points.length === 1) return [{ p: { ...(points[0] as Vec2) }, in: null, out: null, kind: 'corner' }];
  const beziers: Bezier[] = [];
  const look = Math.min(points.length - 1, 3);
  const tan1 = norm(sub(points[look] as Vec2, points[0] as Vec2));
  const tan2 = norm(sub(points[points.length - 1 - look] as Vec2, points[points.length - 1] as Vec2));
  fitCubic(points, tan1, tan2, Math.max(error, 1e-6), beziers);
  const anchors: Anchor[] = beziers.map((b, i) => ({
    p: { ...b[0] },
    in: i === 0 ? null : { ...(beziers[i - 1] as Bezier)[2] },
    out: { ...b[1] },
    kind: i === 0 ? 'corner' : 'smooth',
  }));
  const last = beziers[beziers.length - 1] as Bezier;
  anchors.push({ p: { ...last[3] }, in: { ...last[2] }, out: null, kind: 'corner' });
  return anchors;
}

/** Ramer–Douglas–Peucker, for the Pencil's polyline preview and for straight-line detection. */
export function simplifyPolyline(points: readonly Vec2[], tolerance: number): Vec2[] {
  if (points.length < 3) return points.slice();
  const a = points[0] as Vec2;
  const b = points[points.length - 1] as Vec2;
  const length = dist(a, b);
  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i] as Vec2;
    const d = length === 0 ? dist(p, a) : Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / length;
    if (d > worst) {
      worst = d;
      index = i;
    }
  }
  if (worst <= tolerance) return [a, b];
  return [...simplifyPolyline(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplifyPolyline(points.slice(index), tolerance)];
}

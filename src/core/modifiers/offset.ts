import paper from 'paper/dist/paper-core';
import { shapeOperation } from '../geometry/booleans';
import type { SubPath } from '../geometry/path';
import type { Vec2 } from '../model/types';
import type { Geometry, ModifierDef } from './types';
import { fitPolygon, flatten, num } from './util';

// Offset Path and Outline Stroke. The contours are flattened and offset edge by edge with the chosen join;
// the raw curve can cross itself (concave corners, collapsing shapes), so paper.js resolves the crossings and
// only loops that wind like the original contour are kept. The result is fitted back to Béziers
// (corners stay corners, curves are refitted), so a circle stays a handful of smooth anchors.
// (clipper2-js was tried first and gave wrong results for simple rectangles, so it is not used.)

const FLATNESS = 0.05;
const FIT_TOLERANCE = 0.15;
const ARC_TOLERANCE = 0.05;

type Join = 'miter' | 'round' | 'bevel';
type Cap = 'butt' | 'round' | 'square';

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
const len = (a: Vec2) => Math.hypot(a.x, a.y);
const unit = (a: Vec2): Vec2 => {
  const l = len(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
/** Right-hand normal of a direction: outward for an algebraically counter-clockwise contour. */
const normalOf = (u: Vec2): Vec2 => ({ x: u.y, y: -u.x });

export function signedArea(points: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as Vec2;
    const q = points[(i + 1) % points.length] as Vec2;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function dedupe(points: readonly Vec2[], closed: boolean): Vec2[] {
  const out = points.filter((p, i) => i === 0 || len(sub(p, points[i - 1] as Vec2)) > 1e-9);
  if (closed && out.length > 1 && len(sub(out[0] as Vec2, out[out.length - 1] as Vec2)) < 1e-9) out.pop();
  return out;
}

/** Points of the join at a vertex, from the end of the previous offset edge to the start of the next one. */
function joinPoints(p: Vec2, n1: Vec2, n2: Vec2, d: number, join: Join, miterLimit: number): Vec2[] {
  const a = add(p, scale(n1, d));
  const b = add(p, scale(n2, d));
  const dot = n1.x * n2.x + n1.y * n2.y;
  if (join === 'miter') {
    const k = 1 + dot;
    if (k > 1e-9 && len(add(n1, n2)) / k <= miterLimit) return [add(p, scale(add(n1, n2), d / k))];
    return [a, b];
  }
  if (join === 'round') {
    const radius = Math.abs(d);
    const step = radius > ARC_TOLERANCE ? 2 * Math.acos(1 - ARC_TOLERANCE / radius) : Math.PI / 4;
    const a0 = Math.atan2(n1.y * Math.sign(d), n1.x * Math.sign(d));
    let delta = Math.atan2(n2.y * Math.sign(d), n2.x * Math.sign(d)) - a0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / step));
    const out: Vec2[] = [a];
    for (let i = 1; i < steps; i++) {
      const t = a0 + (delta * i) / steps;
      out.push({ x: p.x + Math.cos(t) * radius, y: p.y + Math.sin(t) * radius });
    }
    out.push(b);
    return out;
  }
  return [a, b];
}

/** One side of a polyline at distance d (right-hand side for d > 0), with joins at the vertices that open a gap. */
function offsetSide(points: readonly Vec2[], closed: boolean, d: number, join: Join, miterLimit: number): Vec2[] {
  const n = points.length;
  const edges = closed ? n : n - 1;
  const dirs: Vec2[] = [];
  for (let i = 0; i < edges; i++) dirs.push(unit(sub(points[(i + 1) % n] as Vec2, points[i] as Vec2)));
  const out: Vec2[] = [];
  for (let i = 0; i < edges; i++) {
    const u = dirs[i] as Vec2;
    const nrm = normalOf(u);
    const start = add(points[i] as Vec2, scale(nrm, d));
    const end = add(points[(i + 1) % n] as Vec2, scale(nrm, d));
    if (i === 0 && !closed) out.push(start);
    else if (i > 0 || closed) {
      const prev = dirs[(i - 1 + edges) % edges] as Vec2;
      const pn = normalOf(prev);
      const cross = prev.x * u.y - prev.y * u.x;
      if (cross * d > 1e-12) out.push(...joinPoints(points[i] as Vec2, pn, nrm, d, join, miterLimit));
      else out.push(add(points[i] as Vec2, scale(pn, d)), start);
    }
    if (i === edges - 1 && !closed) out.push(end);
  }
  return out;
}

function capPoints(p: Vec2, dir: Vec2, h: number, cap: Cap): Vec2[] {
  // From the right-hand offset point to the left-hand one around the end `p` travelling along `dir`.
  const right = add(p, scale(normalOf(dir), h));
  const left = add(p, scale(normalOf(dir), -h));
  if (cap === 'butt') return [right, left];
  if (cap === 'square') return [right, add(right, scale(dir, h)), add(left, scale(dir, h)), left];
  const step = h > ARC_TOLERANCE ? 2 * Math.acos(1 - ARC_TOLERANCE / h) : Math.PI / 4;
  const a0 = Math.atan2(normalOf(dir).y, normalOf(dir).x);
  const steps = Math.max(2, Math.ceil(Math.PI / step));
  const out: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = a0 - (Math.PI * i) / steps;
    out.push({ x: p.x + Math.cos(t) * h, y: p.y + Math.sin(t) * h });
  }
  return out;
}

const toPaper = (points: readonly Vec2[]): paper.Path => new paper.Path({ segments: points.map((p) => [p.x, p.y]), closed: true, insert: false });

/** Removes the loops a raw offset curve makes where it crosses itself, keeping those that wind like `sign`. */
function cleanLoop(raw: readonly Vec2[], sign: number): Vec2[][] {
  if (raw.length < 3) return [];
  const path = toPaper(raw);
  const resolved = (path as unknown as { resolveCrossings(): paper.PathItem }).resolveCrossings();
  const parts: paper.Path[] = resolved instanceof paper.CompoundPath ? (resolved.children as paper.Path[]) : [resolved as paper.Path];
  const out: Vec2[][] = [];
  for (const part of parts) {
    if (Math.sign(part.area) !== sign || Math.abs(part.area) < 1e-4) continue;
    // Flatten back: the loop is made of straight edges only.
    out.push(part.segments.map((s) => ({ x: s.point.x, y: s.point.y })));
  }
  return out;
}

const paperSign = (points: readonly Vec2[]): number => Math.sign(toPaper(points).area);

function geometryFromLoops(loops: Vec2[][]): Geometry {
  return { fillRule: 'nonzero', subpaths: loops.map((l): SubPath => ({ closed: true, anchors: fitPolygon(l, FIT_TOLERANCE) })).filter((s) => s.anchors.length >= 2) };
}

let scoped = false;
function ensureScope(): void {
  if (scoped) return;
  new paper.PaperScope().setup(new paper.Size(1, 1));
  scoped = true;
}

/** Grows (or shrinks, for a negative delta) the filled region of a geometry. */
export function offsetGeometry(input: Geometry, delta: number, join: Join, miterLimit: number): Geometry {
  ensureScope();
  if (delta === 0) return input;
  const pieces = shapeOperation('unite', [{ subpaths: input.subpaths.map((s) => ({ closed: true, anchors: s.anchors })), fillRule: input.fillRule }]);
  const loops: Vec2[][] = [];
  for (const piece of pieces) {
    piece.subpaths.forEach((contour, index) => {
      let points = dedupe(flatten({ closed: true, anchors: contour.anchors }, FLATNESS), true);
      if (points.length < 3) return;
      // Outer contours run counter-clockwise (algebraically) and holes clockwise, so one normal formula fits both.
      const wantPositive = index === 0;
      if ((signedArea(points) > 0) !== wantPositive) points = points.reverse();
      const raw = offsetSide(points, true, delta, join, Math.max(1, miterLimit));
      loops.push(...cleanLoop(raw, paperSign(points)));
    });
  }
  return geometryFromLoops(loops);
}

/** The filled outline of a stroke of `width` along the contours of a geometry. */
export function strokeOutlineOf(input: Geometry, width: number, join: Join, cap: Cap, miterLimit: number): Geometry {
  ensureScope();
  const h = width / 2;
  const loops: Vec2[][] = [];
  for (const contour of input.subpaths) {
    const points = dedupe(flatten(contour, FLATNESS), contour.closed);
    if (points.length < 2) continue;
    if (contour.closed && points.length >= 3) {
      const ccw = signedArea(points) > 0;
      const oriented = ccw ? points : [...points].reverse();
      const outer = offsetSide(oriented, true, h, join, miterLimit);
      const inner = offsetSide(oriented, true, -h, join, miterLimit);
      loops.push(...cleanLoop(outer, paperSign(oriented)));
      // The inner boundary is a hole: it winds the other way.
      loops.push(...cleanLoop(inner, paperSign(oriented)).map((l) => [...l].reverse()));
    } else {
      const right = offsetSide(points, false, h, join, miterLimit);
      const left = offsetSide(points, false, -h, join, miterLimit).reverse();
      const last = points.length - 1;
      const endDir = unit(sub(points[last] as Vec2, points[last - 1] as Vec2));
      const startDir = unit(sub(points[1] as Vec2, points[0] as Vec2));
      const raw = [...right, ...capPoints(points[last] as Vec2, endDir, h, cap), ...left, ...capPoints(points[0] as Vec2, scale(startDir, -1), h, cap)];
      const sign = paperSign(raw) || 1;
      loops.push(...cleanLoop(raw, sign));
    }
  }
  return geometryFromLoops(loops);
}

export const offsetPath: ModifierDef = {
  id: 'offset-path',
  icon: 'offset-path',
  category: 'path',
  affectsGeometry: true,
  defaults: { offset: 10, join: 'miter', miterLimit: 4 },
  schema: [
    { type: 'number', key: 'offset', unit: 'length', step: 1, decimals: 2 },
    { type: 'select', key: 'join', options: ['miter', 'round', 'bevel'] },
    { type: 'number', key: 'miterLimit', unit: 'none', min: 1, max: 20, step: 0.5, decimals: 1 },
  ],
  apply(input, params) {
    const join = (['miter', 'round', 'bevel'].includes(params.join as string) ? params.join : 'miter') as Join;
    return { geometry: offsetGeometry(input, num(params, 'offset', 10), join, num(params, 'miterLimit', 4)) };
  },
};

export const outlineStroke: ModifierDef = {
  id: 'outline-stroke',
  icon: 'outline-stroke',
  category: 'path',
  affectsGeometry: true,
  defaults: {},
  schema: [],
  apply(input, _params, ctx) {
    const stroke = ctx.stroke;
    if (!stroke || stroke.width <= 0) return { geometry: input };
    return { geometry: input, strokeOutline: strokeOutlineOf(input, stroke.width, stroke.join, stroke.cap, stroke.miterLimit) };
  },
};

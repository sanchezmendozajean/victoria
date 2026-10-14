import type { StrokeStyle, Vec2 } from '../model/types';
import { flattenSegment, pointOnSegment, segmentsOf, splitSegment, type Segment, type SubPath } from './path';

// Stroke details beyond Canvas 2D (Phase 6): arrowheads, variable-width profiles, trimming a path
// by length and dash patterns that fit the path ("alinear a esquinas").

// ── Lengths ─────────────────────────────────────────────────────────────────────────

/** Length of one cubic span (16-point Gauss-like sampling of the speed; exact for straight spans). */
export function segmentLength(s: Segment): number {
  if (s.c1 === s.p0 && s.c2 === s.p3) return Math.hypot(s.p3.x - s.p0.x, s.p3.y - s.p0.y);
  let length = 0;
  let prev = s.p0;
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const p = pointOnSegment(s, i / steps);
    length += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return length;
}

export const subPathLength = (sub: SubPath): number => segmentsOf(sub).reduce((n, s) => n + segmentLength(s), 0);

/** Parameter of the point `distance` along a span (by length, not by t). */
function parameterAtLength(s: Segment, distance: number): number {
  const total = segmentLength(s);
  if (total === 0) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const [left] = splitSegment(s, mid);
    if (segmentLength(left) < distance) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const straight = (a: Vec2, b: Vec2): Segment => ({ p0: a, c1: a, c2: b, p3: b });

/** The spans of an open contour with `start` removed from its beginning and `end` from its end (lengths in pt). */
export function trimSegments(segments: readonly Segment[], start: number, end: number): Segment[] {
  let list = segments.slice();
  let cut = end;
  while (cut > 0 && list.length > 0) {
    const last = list[list.length - 1] as Segment;
    const length = segmentLength(last);
    if (cut >= length) {
      list.pop();
      cut -= length;
    } else {
      if (last.c1 === last.p0 && last.c2 === last.p3) {
        const k = (length - cut) / length;
        list[list.length - 1] = straight(last.p0, { x: last.p0.x + (last.p3.x - last.p0.x) * k, y: last.p0.y + (last.p3.y - last.p0.y) * k });
      } else {
        list[list.length - 1] = splitSegment(last, parameterAtLength(last, length - cut))[0];
      }
      cut = 0;
    }
  }
  cut = start;
  while (cut > 0 && list.length > 0) {
    const first = list[0] as Segment;
    const length = segmentLength(first);
    if (cut >= length) {
      list.shift();
      cut -= length;
    } else {
      if (first.c1 === first.p0 && first.c2 === first.p3) {
        const k = cut / length;
        list[0] = straight({ x: first.p0.x + (first.p3.x - first.p0.x) * k, y: first.p0.y + (first.p3.y - first.p0.y) * k }, first.p3);
      } else {
        list[0] = splitSegment(first, parameterAtLength(first, cut))[1];
      }
      cut = 0;
    }
  }
  list = list.filter((s) => s.p0 !== undefined);
  return list;
}

// ── Dashes ──────────────────────────────────────────────────────────────────────────

/**
 * Scales a dash pattern so that it fits the length of the path a whole number of times, which makes
 * dashes start and end exactly at the ends (and, in a closed path, meet at the start): "Alinear
 * guiones a esquinas y extremos". The pattern repeats if it has an odd number of entries, as in Canvas.
 */
export function alignedDash(dash: readonly number[], length: number): number[] {
  const pattern = dash.length % 2 === 1 ? [...dash, ...dash] : [...dash];
  const sum = pattern.reduce((a, b) => a + b, 0);
  if (sum <= 0 || length <= 0) return pattern;
  const repeats = Math.max(1, Math.round(length / sum));
  const scale = length / (repeats * sum);
  return pattern.map((v) => v * scale);
}

// ── Arrowheads ───────────────────────────────────────────────────────────────────────

export interface ArrowShape {
  /** Closed polygons to fill, in a frame where the tip is at (0, 0) and the head points along −x (base behind). */
  fills: Vec2[][];
  /** Open polylines to stroke with the path's stroke width. */
  lines: Vec2[][];
  /** How far the head reaches back from its tip along the path (in units of the head size). */
  length: number;
}

export type ArrowDef = (size: number) => ArrowShape;

const P = (x: number, y: number): Vec2 => ({ x, y });

function circle(radius: number, centreX: number): Vec2[] {
  return Array.from({ length: 20 }, (_, i) => {
    const a = (i / 20) * Math.PI * 2;
    return P(centreX + radius * Math.cos(a), radius * Math.sin(a));
  });
}

/** The built-in arrowheads (specs/06 · Trazo): ids are stored in `StrokeStyle.startArrow / endArrow`. */
export const ARROWS: Record<string, { name: string; make: ArrowDef }> = {
  simple: { name: 'arrow.simple', make: (u) => ({ fills: [[P(0, 0), P(-3 * u, 1.5 * u), P(-3 * u, -1.5 * u)]], lines: [], length: 3 * u }) },
  barbed: { name: 'arrow.barbed', make: (u) => ({ fills: [[P(0, 0), P(-3.4 * u, 1.7 * u), P(-2.4 * u, 0), P(-3.4 * u, -1.7 * u)]], lines: [], length: 2.4 * u }) },
  open: { name: 'arrow.open', make: (u) => ({ fills: [], lines: [[P(-2.4 * u, 1.6 * u), P(0, 0), P(-2.4 * u, -1.6 * u)]], length: 0 }) },
  circle: { name: 'arrow.circle', make: (u) => ({ fills: [circle(1.3 * u, -1.3 * u)], lines: [], length: 2.6 * u }) },
  diamond: { name: 'arrow.diamond', make: (u) => ({ fills: [[P(0, 0), P(-1.8 * u, 1.2 * u), P(-3.6 * u, 0), P(-1.8 * u, -1.2 * u)]], lines: [], length: 3.6 * u }) },
  square: { name: 'arrow.square', make: (u) => ({ fills: [[P(0, 1.3 * u), P(-2.6 * u, 1.3 * u), P(-2.6 * u, -1.3 * u), P(0, -1.3 * u)]], lines: [], length: 2.6 * u }) },
  bar: { name: 'arrow.bar', make: (u) => ({ fills: [], lines: [[P(0, 1.8 * u), P(0, -1.8 * u)]], length: 0 }) },
};

export const ARROW_IDS = Object.keys(ARROWS);

export interface Arrowhead {
  /** Fill polygons and stroke lines, already placed and rotated in the path's coordinates. */
  fills: Vec2[][];
  lines: Vec2[][];
  /** How much of the path the head replaces (the path is trimmed by this much at that end). */
  trim: number;
}

/** Unit direction at the very end (or start) of an open contour, following the tangent of the last span. */
export function endTangent(sub: SubPath, end: 'start' | 'end'): { point: Vec2; direction: Vec2 } | null {
  const segs = segmentsOf(sub);
  const seg = end === 'start' ? segs[0] : segs[segs.length - 1];
  if (!seg) return null;
  const point = end === 'start' ? seg.p0 : seg.p3;
  const candidates = end === 'start' ? [seg.c1, seg.c2, seg.p3] : [seg.c2, seg.c1, seg.p0];
  for (const c of candidates) {
    const dx = end === 'start' ? c.x - point.x : point.x - c.x;
    const dy = end === 'start' ? c.y - point.y : point.y - c.y;
    const l = Math.hypot(dx, dy);
    if (l > 1e-9) return { point, direction: { x: dx / l, y: dy / l } };
  }
  return null;
}

/**
 * The arrowhead of `stroke` at one end of an open contour, or null when there is none. `direction` of an
 * end points out of the path, so a head at the start is the mirror image of one at the end.
 */
export function arrowheadAt(sub: SubPath, stroke: StrokeStyle, end: 'start' | 'end'): Arrowhead | null {
  const id = end === 'start' ? stroke.startArrow : stroke.endArrow;
  const def = id ? ARROWS[id] : undefined;
  if (!def || sub.closed || sub.anchors.length < 2) return null;
  const tangent = endTangent(sub, end);
  if (!tangent) return null;
  const u = Math.max(stroke.width, 1);
  const [sx, sy] = stroke.arrowScale;
  const shape = def.make(u);
  const out = end === 'start' ? { x: -tangent.direction.x, y: -tangent.direction.y } : tangent.direction;
  // 'extend': the tip goes beyond the end of the path; default: the tip sits at the end.
  const shift = stroke.arrowAlign === 'extend' ? shape.length * (sx / 100) : 0;
  const tip = { x: tangent.point.x + out.x * shift, y: tangent.point.y + out.y * shift };
  const place = (p: Vec2): Vec2 => {
    const x = p.x * (sx / 100);
    const y = p.y * (sy / 100);
    // Frame: +x = `out`, +y = out rotated 90° clockwise on screen.
    return { x: tip.x + x * out.x - y * out.y, y: tip.y + x * out.y + y * out.x };
  };
  return {
    fills: shape.fills.map((poly) => poly.map(place)),
    lines: shape.lines.map((line) => line.map(place)),
    trim: Math.max(0, shape.length * (sx / 100) - shift) * 0.9,
  };
}

// ── Width profiles ───────────────────────────────────────────────────────────────────

export interface WidthProfile {
  name: string;
  /** Width multiplier at `t` along the path (0 at the start, 1 at the end). */
  at(t: number): number;
}

/** "Perfil de ancho variable": uniform and six profiles (specs/06 · Trazo). */
export const WIDTH_PROFILES: Record<string, WidthProfile> = {
  uniform: { name: 'profile.uniform', at: () => 1 },
  taper: { name: 'profile.taper', at: (t) => Math.max(0.02, 1 - t) },
  taperStart: { name: 'profile.taperStart', at: (t) => Math.max(0.02, t) },
  lens: { name: 'profile.lens', at: (t) => Math.max(0.02, Math.sin(Math.PI * t)) },
  bulge: { name: 'profile.bulge', at: (t) => 0.45 + 0.55 * Math.sin(Math.PI * t) },
  pinch: { name: 'profile.pinch', at: (t) => 1 - 0.7 * Math.sin(Math.PI * t) },
  flare: { name: 'profile.flare', at: (t) => 0.25 + 0.75 * t * t },
};

export const PROFILE_IDS = Object.keys(WIDTH_PROFILES);

/**
 * The outline of a stroke whose width follows `profile`, as polygons to fill with the stroke paint: one
 * polygon for an open contour, two (outer and inner, fill them even-odd) for a closed one. Curves are
 * flattened with `tolerance`.
 */
export function variableWidthOutline(sub: SubPath, width: number, profile: WidthProfile, flip = false, tolerance = 0.1): Vec2[][] {
  const first = sub.anchors[0];
  if (!first) return [];
  const points: Vec2[] = [first.p];
  for (const seg of segmentsOf(sub)) flattenSegment(seg, tolerance, points);
  if (sub.closed && points.length > 1) {
    const a = points[0] as Vec2;
    const b = points[points.length - 1] as Vec2;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-9) points.pop();
  }
  if (points.length < 2) return [];
  // Cumulative length → t.
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push((cumulative[i - 1] as number) + Math.hypot((points[i] as Vec2).x - (points[i - 1] as Vec2).x, (points[i] as Vec2).y - (points[i - 1] as Vec2).y));
  const total = sub.closed ? (cumulative[cumulative.length - 1] as number) + Math.hypot((points[0] as Vec2).x - (points[points.length - 1] as Vec2).x, (points[0] as Vec2).y - (points[points.length - 1] as Vec2).y) : (cumulative[cumulative.length - 1] as number);
  if (total === 0) return [];
  const n = points.length;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = sub.closed ? (points[(i - 1 + n) % n] as Vec2) : (points[Math.max(0, i - 1)] as Vec2);
    const next = sub.closed ? (points[(i + 1) % n] as Vec2) : (points[Math.min(n - 1, i + 1)] as Vec2);
    const here = points[i] as Vec2;
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const l = Math.hypot(dx, dy);
    if (l === 0) {
      dx = 1;
      dy = 0;
    } else {
      dx /= l;
      dy /= l;
    }
    let t = (cumulative[i] as number) / total;
    if (flip) t = 1 - t;
    const half = (width * profile.at(Math.min(1, Math.max(0, t)))) / 2;
    left.push(P(here.x - dy * half, here.y + dx * half));
    right.push(P(here.x + dy * half, here.y - dx * half));
  }
  return sub.closed ? [left, right] : [[...left, ...right.reverse()]];
}

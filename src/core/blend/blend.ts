import { deepClone } from '../model/deepClone';
import { colorToRgb } from '../model/color';
import type { Anchor, Appearance, AppearanceItem, Color, Paint, Vec2 } from '../model/types';
import { segmentsOf, splitSegment, subPathBounds, type SubPath } from '../geometry/path';

// Mezcla (specs/03 · Mezcla): the pure maths. Two contours are given the same number of anchors and then
// interpolated anchor by anchor (position and handles); looks are interpolated field by field.

export const BLEND_MIN_STEPS = 1;
export const BLEND_MAX_STEPS = 1000;
export const BLEND_DEFAULT_STEPS = 5;

export const clampBlendSteps = (n: number): number => Math.min(BLEND_MAX_STEPS, Math.max(BLEND_MIN_STEPS, Math.round(Number.isFinite(n) ? n : BLEND_DEFAULT_STEPS)));

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpPoint = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const same = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;
/** A handle that sits on its anchor is a retracted handle. */
const handle = (p: Vec2, c: Vec2): Vec2 | null => (same(p, c) ? null : c);

function chordLength(a: Anchor, b: Anchor): number {
  const o = a.out ?? a.p;
  const i = b.in ?? b.p;
  return Math.hypot(o.x - a.p.x, o.y - a.p.y) + Math.hypot(i.x - o.x, i.y - o.y) + Math.hypot(b.p.x - i.x, b.p.y - i.y);
}

/** Splits the longest span in two (at its middle) until the contour has `count` anchors. */
function refine(sub: SubPath, count: number): SubPath {
  const anchors = sub.anchors.map((a) => ({ ...a }));
  const spans = () => (sub.closed ? anchors.length : anchors.length - 1);
  if (anchors.length < 2) return { anchors, closed: sub.closed };
  while (anchors.length < count) {
    let best = 0;
    let bestLength = -1;
    for (let i = 0; i < spans(); i++) {
      const length = chordLength(anchors[i] as Anchor, anchors[(i + 1) % anchors.length] as Anchor);
      if (length > bestLength) {
        bestLength = length;
        best = i;
      }
    }
    const a = anchors[best] as Anchor;
    const next = (best + 1) % anchors.length;
    const b = anchors[next] as Anchor;
    const [left, right] = splitSegment({ p0: a.p, c1: a.out ?? a.p, c2: b.in ?? b.p, p3: b.p }, 0.5);
    const straight = !a.out && !b.in;
    const middle: Anchor = straight ? { p: left.p3, in: null, out: null, kind: 'corner' } : { p: left.p3, in: left.c2, out: right.c1, kind: 'smooth' };
    anchors[best] = { ...a, out: straight ? null : handle(a.p, left.c1) };
    anchors[next] = { ...b, in: straight ? null : handle(b.p, right.c2) };
    anchors.splice(best + 1, 0, middle);
  }
  return { anchors, closed: sub.closed };
}

function signedArea(sub: SubPath): number {
  let sum = 0;
  for (const s of segmentsOf({ anchors: sub.anchors, closed: true })) sum += s.p0.x * s.p3.y - s.p3.x * s.p0.y;
  return sum / 2;
}

function reversed(sub: SubPath): SubPath {
  return { closed: sub.closed, anchors: [...sub.anchors].reverse().map((a) => ({ ...a, in: a.out, out: a.in })) };
}

/** Same number of anchors, the same winding and (closed) the starting point of `b` that best lines up with `a`. */
export function matchContours(a: SubPath, b: SubPath): [SubPath, SubPath] {
  const closed = a.closed && b.closed;
  const count = Math.max(a.anchors.length, b.anchors.length);
  const ma = refine({ anchors: a.anchors, closed }, count);
  let mb = refine({ anchors: b.anchors, closed }, count);
  if (closed) {
    if (Math.sign(signedArea(ma)) !== Math.sign(signedArea(mb))) mb = reversed(mb);
    let bestShift = 0;
    let bestCost = Infinity;
    for (let shift = 0; shift < count; shift++) {
      let cost = 0;
      for (let i = 0; i < count; i++) {
        const p = (ma.anchors[i] as Anchor).p;
        const q = (mb.anchors[(i + shift) % count] as Anchor).p;
        cost += (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestShift = shift;
      }
    }
    if (bestShift > 0) mb = { closed, anchors: [...mb.anchors.slice(bestShift), ...mb.anchors.slice(0, bestShift)] };
  }
  return [ma, mb];
}

function lerpAnchor(a: Anchor, b: Anchor, t: number): Anchor {
  // A handle that is retracted on one side is interpolated from its anchor.
  const out = a.out || b.out ? lerpPoint(a.out ?? a.p, b.out ?? b.p, t) : null;
  const inn = a.in || b.in ? lerpPoint(a.in ?? a.p, b.in ?? b.p, t) : null;
  return { p: lerpPoint(a.p, b.p, t), in: inn, out, kind: a.kind === 'corner' || b.kind === 'corner' ? 'corner' : a.kind };
}

/** The contours at the given positions (0 = `a`, 1 = `b`) of the way from `a` to `b`. */
export function blendContours(a: SubPath, b: SubPath, ts: readonly number[]): SubPath[] {
  const [ma, mb] = matchContours(a, b);
  return ts.map((t) => ({ closed: ma.closed, anchors: ma.anchors.map((anchor, i) => lerpAnchor(anchor, mb.anchors[i] as Anchor, t)) }));
}

// ── Look ──

function lerpColor(a: Color, b: Color, t: number): Color {
  const [ar, ag, ab] = colorToRgb(a);
  const [br, bg, bb] = colorToRgb(b);
  const alpha = a.alpha === undefined && b.alpha === undefined ? {} : { alpha: lerp(a.alpha ?? 1, b.alpha ?? 1, t) };
  return { model: 'rgb', values: [lerp(ar, br, t), lerp(ag, bg, t), lerp(ab, bb, t)].map((v) => Math.round(v * 100) / 100), ...alpha };
}

function lerpPaint(a: Paint, b: Paint, t: number): Paint {
  if (a.type === 'solid' && b.type === 'solid') return { type: 'solid', color: lerpColor(a.color, b.color, t) };
  return deepClone(t < 0.5 ? a : b);
}

/** Colours, opacities and stroke weights are interpolated item by item; when the two stacks differ, the nearest end wins. */
export function blendAppearance(a: Appearance, b: Appearance, t: number): Appearance {
  const nearest = t < 0.5 ? a : b;
  if (a.items.length !== b.items.length || a.items.some((item, i) => item.kind !== (b.items[i] as AppearanceItem).kind)) return deepClone(nearest);
  const items = a.items.map((ia, i): AppearanceItem => {
    const ib = b.items[i] as AppearanceItem;
    const near = t < 0.5 ? ia : ib;
    if (ia.kind === 'fill' && ib.kind === 'fill' && near.kind === 'fill') {
      return { kind: 'fill', paint: lerpPaint(ia.paint, ib.paint, t), opacity: lerp(ia.opacity, ib.opacity, t), modifiers: deepClone(near.modifiers) };
    }
    if (ia.kind === 'stroke' && ib.kind === 'stroke' && near.kind === 'stroke') {
      return { kind: 'stroke', paint: lerpPaint(ia.paint, ib.paint, t), stroke: { ...deepClone(near.stroke), width: lerp(ia.stroke.width, ib.stroke.width, t) }, opacity: lerp(ia.opacity, ib.opacity, t), modifiers: deepClone(near.modifiers) };
    }
    return deepClone(near);
  });
  return { items };
}

/**
 * Positions (0–1) that leave the same empty gap between every pair of neighbouring objects, measured along the line
 * between the two key objects' centres (the extent of each object along it grows linearly from one end to the other).
 * Null when that is not possible (same centre, or objects that grow faster than they travel): use equal steps then.
 */
export function equidistantPositions(a: SubPath, b: SubPath, steps: number): number[] | null {
  const ra = subPathBounds(a);
  const rb = subPathBounds(b);
  if (!ra || !rb || steps < 1) return null;
  const dx = (rb.minX + rb.maxX - ra.minX - ra.maxX) / 2;
  const dy = (rb.minY + rb.maxY - ra.minY - ra.maxY) / 2;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-9) return null;
  const ux = Math.abs(dx / distance);
  const uy = Math.abs(dy / distance);
  const extent = (r: typeof ra) => ux * (r.maxX - r.minX) + uy * (r.maxY - r.minY);
  const growth = extent(rb) - extent(ra);
  // gap(t_i, t_i+1) = D·Δt − w0 − W·(t_i + t_i+1)/2 = g for every i; t_i is linear in (g + w0), solved for t_(n+1) = 1.
  const slow = distance - growth / 2;
  const fast = distance + growth / 2;
  if (slow <= 1e-9) return null;
  let s = 0;
  const factors = [0];
  for (let i = 0; i <= steps; i++) {
    s = (1 + fast * s) / slow;
    factors.push(s);
  }
  const total = factors[steps + 1] as number;
  if (!(total > 0) || !Number.isFinite(total)) return null;
  const ts = factors.slice(1, steps + 1).map((f) => f / total);
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i] as number;
    if (!(t > 0 && t < 1) || (i > 0 && t <= (ts[i - 1] as number))) return null;
  }
  return ts;
}

/** The positions (0–1) of the intermediate objects between two key objects. */
export const blendPositions = (steps: number): number[] => Array.from({ length: steps }, (_, i) => (i + 1) / (steps + 1));

export { lerp as blendLerp };

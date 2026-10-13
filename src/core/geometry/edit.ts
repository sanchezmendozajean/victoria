import type { Anchor, Vec2 } from '../model/types';
import { pointOnSegment, segmentsOf, type Segment, type SubPath } from './path';

const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Vec2) => Math.hypot(v.x, v.y);

export const isStraightSegment = (s: Segment): boolean => s.c1 === s.p0 && s.c2 === s.p3;

export interface SegmentProjection {
  segmentIndex: number;
  /** Parameter on the cubic, 0..1. */
  t: number;
  point: Vec2;
  distance: number;
}

/** Closest point of one cubic to `p`: coarse sampling, then a local refinement. */
export function projectOnSegment(seg: Segment, p: Vec2): { t: number; point: Vec2; distance: number } {
  const samples = 32;
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const q = pointOnSegment(seg, t);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  let lo = Math.max(0, bestT - 1 / samples);
  let hi = Math.min(1, bestT + 1 / samples);
  for (let i = 0; i < 24; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const d1 = Math.hypot(pointOnSegment(seg, m1).x - p.x, pointOnSegment(seg, m1).y - p.y);
    const d2 = Math.hypot(pointOnSegment(seg, m2).x - p.x, pointOnSegment(seg, m2).y - p.y);
    if (d1 < d2) hi = m2;
    else lo = m1;
  }
  const t = (lo + hi) / 2;
  const point = pointOnSegment(seg, t);
  return { t, point, distance: Math.hypot(point.x - p.x, point.y - p.y) };
}

/** Nearest point on any span of a contour. */
export function projectOnSubPath(subPath: SubPath, p: Vec2): SegmentProjection | null {
  let best: SegmentProjection | null = null;
  segmentsOf(subPath).forEach((seg, segmentIndex) => {
    const hit = projectOnSegment(seg, p);
    if (!best || hit.distance < best.distance) best = { segmentIndex, ...hit };
  });
  return best;
}

/**
 * New control points when the curve point at `t` is dragged by `delta` (Illustrator's "reshape"):
 * both handles move, the nearer one more, so the curve follows the cursor.
 */
export function reshapeControls(seg: Segment, t: number, delta: Vec2): { c1: Vec2; c2: Vec2 } {
  const u = 1 - t;
  const denominator = 3 * t * u * (u * u + t * t);
  // At the very ends the curve point cannot move by changing handles: keep them.
  if (denominator < 1e-9) return { c1: seg.c1, c2: seg.c2 };
  const s = 1 / denominator;
  return { c1: add(seg.c1, { x: delta.x * u * s, y: delta.y * u * s }), c2: add(seg.c2, { x: delta.x * t * s, y: delta.y * t * s }) };
}

const cloneAnchor = (a: Anchor): Anchor => ({ ...a, p: { ...a.p }, in: a.in && { ...a.in }, out: a.out && { ...a.out } });

/** Moves anchors with their handles. Returns new anchors; the input is untouched. */
export function moveAnchors(anchors: readonly Anchor[], indices: readonly number[], delta: Vec2): Anchor[] {
  const moving = new Set(indices);
  return anchors.map((a, i) => {
    if (!moving.has(i)) return cloneAnchor(a);
    return { ...a, p: add(a.p, delta), in: a.in && add(a.in, delta), out: a.out && add(a.out, delta) };
  });
}

/** Rotates the opposite handle to stay collinear with `moved`, keeping its own length (or mirroring it). */
function alignOpposite(anchor: Anchor, moved: 'in' | 'out'): Anchor {
  const handle = moved === 'in' ? anchor.in : anchor.out;
  const opposite = moved === 'in' ? anchor.out : anchor.in;
  if (!handle || !opposite) return anchor;
  const direction = sub(anchor.p, handle);
  const dirLen = len(direction);
  if (dirLen === 0) return anchor;
  const oppositeLength = anchor.kind === 'asymmetric' ? len(sub(handle, anchor.p)) : len(sub(opposite, anchor.p));
  const next = add(anchor.p, { x: (direction.x / dirLen) * oppositeLength, y: (direction.y / dirLen) * oppositeLength });
  return moved === 'in' ? { ...anchor, out: next } : { ...anchor, in: next };
}

export interface HandleDragOptions {
  /** Alt: break the symmetry; the anchor becomes a corner and only this handle moves. */
  alt?: boolean;
  /** Shift: constrain the handle angle to multiples of 45° around its anchor. */
  constrain?: boolean;
}

function constrainAngle(origin: Vec2, p: Vec2): Vec2 {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const r = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: origin.x + r * Math.cos(angle), y: origin.y + r * Math.sin(angle) };
}

/** Drags one handle of an anchor to `to` (local coordinates), following the rules of specs/03 · Selección directa. */
export function moveHandle(anchors: readonly Anchor[], index: number, which: 'in' | 'out', to: Vec2, options: HandleDragOptions = {}): Anchor[] {
  const result = anchors.map(cloneAnchor);
  const anchor = result[index];
  if (!anchor) return result;
  const target = options.constrain ? constrainAngle(anchor.p, to) : to;
  anchor[which] = target;
  if (options.alt) {
    anchor.kind = 'corner';
  } else if (anchor.kind !== 'corner') {
    result[index] = alignOpposite(anchor, which);
  }
  return result;
}

/**
 * Drags the curve point at `t` of span `segmentIndex` by `delta`. A straight span moves its two
 * anchors instead (like Illustrator); a curved span reshapes its handles, keeping smooth anchors smooth.
 */
export function reshapeSpan(anchors: readonly Anchor[], closed: boolean, segmentIndex: number, t: number, delta: Vec2): Anchor[] {
  const sub: SubPath = { anchors: anchors as Anchor[], closed };
  const seg = segmentsOf(sub)[segmentIndex];
  if (!seg) return anchors.map(cloneAnchor);
  const a = segmentIndex;
  const b = (segmentIndex + 1) % anchors.length;
  if (isStraightSegment(seg)) return moveAnchors(anchors, [a, b], delta);

  const { c1, c2 } = reshapeControls(seg, t, delta);
  const result = anchors.map(cloneAnchor);
  result[a] = { ...(result[a] as Anchor), out: c1 };
  result[b] = { ...(result[b] as Anchor), in: c2 };
  if ((result[a] as Anchor).kind !== 'corner') result[a] = alignOpposite(result[a] as Anchor, 'out');
  if ((result[b] as Anchor).kind !== 'corner') result[b] = alignOpposite(result[b] as Anchor, 'in');
  return result;
}

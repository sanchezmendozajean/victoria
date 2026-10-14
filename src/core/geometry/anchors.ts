import type { Anchor, Vec2 } from '../model/types';
import { moveAnchors } from './edit';
import { pointOnSegment, segmentsOf, splitSegment, type SubPath } from './path';
import { roundedPolygon } from './shapes';

// Anchor-level path operations of Phase 5: add/remove/convert anchors, scissors, join, average,
// curvature spline and live corners. All pure: they take anchors and return new anchors.

const same = (a: Vec2, b: Vec2, eps = 1e-6) => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
const at = (anchors: readonly Anchor[], i: number): Anchor => anchors[((i % anchors.length) + anchors.length) % anchors.length] as Anchor;
const clone = (a: Anchor): Anchor => ({ ...a, p: { ...a.p }, in: a.in && { ...a.in }, out: a.out && { ...a.out } });

export const cornerAnchor = (p: Vec2): Anchor => ({ p: { ...p }, in: null, out: null, kind: 'corner' });

/** A smooth anchor whose out handle is `out` and whose in handle mirrors it (Pen: click and drag). */
export function smoothAnchor(p: Vec2, out: Vec2): Anchor {
  return { p: { ...p }, out: { ...out }, in: { x: 2 * p.x - out.x, y: 2 * p.y - out.y }, kind: 'smooth' };
}

// ── Add / remove / convert ──────────────────────────────────────────────────────────────

/** Splits span `segment` at `t`, keeping the curve exactly. Straight spans get a corner anchor; curved ones a smooth anchor. */
export function insertAnchor(anchors: readonly Anchor[], closed: boolean, segment: number, t: number): { anchors: Anchor[]; index: number } {
  const seg = segmentsOf({ anchors: anchors as Anchor[], closed })[segment];
  if (!seg) return { anchors: anchors.map(clone), index: -1 };
  const a = at(anchors, segment);
  const b = at(anchors, segment + 1);
  const [left, right] = splitSegment(seg, t);
  const straight = !a.out && !b.in;
  const middle: Anchor = straight ? cornerAnchor(pointOnSegment(seg, t)) : { p: left.p3, in: left.c2, out: right.c1, kind: 'smooth' };
  const next = anchors.map(clone);
  if (!straight) {
    next[segment] = { ...clone(a), out: a.out ? left.c1 : null };
    const bi = (segment + 1) % anchors.length;
    next[bi] = { ...clone(b), in: b.in ? right.c2 : null };
  }
  const index = segment + 1;
  next.splice(index, 0, middle);
  return { anchors: next, index };
}

/** Removes anchors, leaving the neighbours' handles as they are (Illustrator's Delete Anchor Point). null = nothing left to draw. */
export function removeAnchors(anchors: readonly Anchor[], indices: readonly number[]): Anchor[] | null {
  const drop = new Set(indices);
  const kept = anchors.filter((_, i) => !drop.has(i)).map(clone);
  return kept.length < 2 ? null : kept;
}

export function convertToCorner(anchors: readonly Anchor[], indices: readonly number[]): Anchor[] {
  const pick = new Set(indices);
  return anchors.map((a, i) => (pick.has(i) ? { ...clone(a), in: null, out: null, kind: 'corner' as const } : clone(a)));
}

/** Corner → smooth with handles along the line between the neighbours, a third of the way to each. */
export function convertToSmooth(anchors: readonly Anchor[], closed: boolean, indices: readonly number[]): Anchor[] {
  const pick = new Set(indices);
  const n = anchors.length;
  return anchors.map((a, i) => {
    if (!pick.has(i)) return clone(a);
    const prev = closed || i > 0 ? at(anchors, i - 1).p : null;
    const next = closed || i < n - 1 ? at(anchors, i + 1).p : null;
    const from = prev ?? a.p;
    const to = next ?? a.p;
    const d = { x: to.x - from.x, y: to.y - from.y };
    const l = Math.hypot(d.x, d.y);
    if (l === 0) return clone(a);
    const u = { x: d.x / l, y: d.y / l };
    const lenIn = prev ? Math.hypot(a.p.x - prev.x, a.p.y - prev.y) / 3 : 0;
    const lenOut = next ? Math.hypot(next.x - a.p.x, next.y - a.p.y) / 3 : 0;
    return {
      ...clone(a),
      kind: 'smooth' as const,
      in: lenIn > 0 ? { x: a.p.x - u.x * lenIn, y: a.p.y - u.y * lenIn } : null,
      out: lenOut > 0 ? { x: a.p.x + u.x * lenOut, y: a.p.y + u.y * lenOut } : null,
    };
  });
}

// ── Scissors ──────────────────────────────────────────────────────────────────────────

export type CutTarget = { anchor: number } | { segment: number; t: number };

/**
 * Cuts a path at an anchor or inside a span, leaving two coincident anchors at the cut. An open path
 * becomes two open paths; a closed one becomes a single open path. Cutting an end anchor of an open
 * path changes nothing (null).
 */
export function cutPath(anchors: readonly Anchor[], closed: boolean, target: CutTarget): Anchor[][] | null {
  let list = anchors.map(clone);
  let index: number;
  if ('anchor' in target) {
    index = target.anchor;
  } else {
    const inserted = insertAnchor(list, closed, target.segment, target.t);
    if (inserted.index < 0) return null;
    list = inserted.anchors;
    index = inserted.index;
  }
  const n = list.length;
  const here = list[index];
  if (!here) return null;
  if (closed) {
    const rotated = [...list.slice(index), ...list.slice(0, index)];
    const first = { ...clone(here), in: null };
    const last = { ...clone(here), out: null };
    return [[first, ...rotated.slice(1), last]];
  }
  if (index <= 0 || index >= n - 1) return null;
  return [
    [...list.slice(0, index), { ...clone(here), out: null }],
    [{ ...clone(here), in: null }, ...list.slice(index + 1)],
  ];
}

// ── Join / average ──────────────────────────────────────────────────────────────────────

export const reverseAnchors = (anchors: readonly Anchor[]): Anchor[] => anchors.map((a) => ({ ...clone(a), in: a.out && { ...a.out }, out: a.in && { ...a.in } })).reverse();

function weld(first: Anchor, second: Anchor): Anchor {
  const kind = first.kind === 'smooth' && second.kind === 'smooth' ? 'smooth' : 'corner';
  return { p: { ...first.p }, in: first.in && { ...first.in }, out: second.out && { ...second.out }, kind };
}

/** Joins two open paths end to end; anchors that coincide are welded into one. */
export function joinPaths(a: readonly Anchor[], aEnd: 'start' | 'end', b: readonly Anchor[], bEnd: 'start' | 'end'): Anchor[] {
  const head = aEnd === 'end' ? a.map(clone) : reverseAnchors(a);
  const tail = bEnd === 'start' ? b.map(clone) : reverseAnchors(b);
  const last = head[head.length - 1];
  const first = tail[0];
  if (last && first && same(last.p, first.p)) return [...head.slice(0, -1), weld(last, first), ...tail.slice(1)];
  return [...head, ...tail];
}

/** Closes an open path (Ctrl+J on its two ends). Coincident ends merge into one anchor. */
export function closeOpenPath(anchors: readonly Anchor[]): Anchor[] {
  const list = anchors.map(clone);
  const first = list[0];
  const last = list[list.length - 1];
  if (list.length > 2 && first && last && same(first.p, last.p)) {
    list.pop();
    list[0] = weld(last, first);
  }
  return list;
}

/** Average (Alt+Ctrl+J): moves the chosen anchors to their mean on one axis or both, handles with them. */
export function averageAnchors(anchors: readonly Anchor[], indices: readonly number[], axis: 'x' | 'y' | 'both'): Anchor[] {
  if (indices.length === 0) return anchors.map(clone);
  const mean = { x: 0, y: 0 };
  for (const i of indices) {
    mean.x += at(anchors, i).p.x / indices.length;
    mean.y += at(anchors, i).p.y / indices.length;
  }
  let result = anchors.map(clone);
  for (const i of indices) {
    const p = at(result, i).p;
    result = moveAnchors(result, [i], { x: axis === 'y' ? 0 : mean.x - p.x, y: axis === 'x' ? 0 : mean.y - p.y });
  }
  return result;
}

// ── Curvature ──────────────────────────────────────────────────────────────────────────

/**
 * Smooth curve through points (uniform Catmull-Rom as cubic Béziers), as the Curvature tool draws.
 * Anchors listed in `corners` stay sharp (no handles).
 */
export function curvatureAnchors(points: readonly Vec2[], corners: ReadonlySet<number> = new Set(), closed = false): Anchor[] {
  const n = points.length;
  const anchors = points.map((p, i): Anchor => ({ p: { ...p }, in: null, out: null, kind: corners.has(i) ? 'corner' : 'smooth' }));
  if (n < 3 && !closed) return anchors;
  const point = (i: number): Vec2 => {
    if (closed) return points[((i % n) + n) % n] as Vec2;
    if (i < 0) return { x: 2 * (points[0] as Vec2).x - (points[1] as Vec2).x, y: 2 * (points[0] as Vec2).y - (points[1] as Vec2).y };
    if (i >= n) return { x: 2 * (points[n - 1] as Vec2).x - (points[n - 2] as Vec2).x, y: 2 * (points[n - 1] as Vec2).y - (points[n - 2] as Vec2).y };
    return points[i] as Vec2;
  };
  for (let i = 0; i < n; i++) {
    const a = anchors[i] as Anchor;
    const hasPrev = closed || i > 0;
    const hasNext = closed || i < n - 1;
    const prev = point(i - 1);
    const next = point(i + 1);
    const here = points[i] as Vec2;
    if (a.kind === 'corner') continue;
    const tangent = { x: (next.x - prev.x) / 6, y: (next.y - prev.y) / 6 };
    if (hasNext) a.out = { x: here.x + tangent.x, y: here.y + tangent.y };
    if (hasPrev) a.in = { x: here.x - tangent.x, y: here.y - tangent.y };
  }
  return anchors;
}

// ── Live corners on paths ───────────────────────────────────────────────────────────────────

/** True when any anchor of the contour carries a live-corner radius. */
export const hasLiveCorners = (anchors: readonly Anchor[]): boolean => anchors.some((a) => (a.cornerRadius ?? 0) > 0);

/**
 * Contour with each anchor's `cornerRadius` applied. Only corner anchors with straight spans on both
 * sides are rounded (others are left alone); the radius shrinks to fit the shorter neighbouring span.
 * Rounding yields two anchors per corner, each without a radius.
 */
export function applyCornerRadii(sub: SubPath): SubPath {
  const { anchors, closed } = sub;
  if (!hasLiveCorners(anchors)) return sub;
  const n = anchors.length;
  const out: Anchor[] = [];
  const roundable = (i: number): boolean => {
    const a = at(anchors, i);
    if ((a.cornerRadius ?? 0) <= 0 || a.in || a.out) return false;
    if (!closed && (i === 0 || i === n - 1)) return false;
    return !at(anchors, i - 1).out && !at(anchors, i + 1).in;
  };
  for (let i = 0; i < n; i++) {
    const a = at(anchors, i);
    if (!roundable(i)) {
      out.push(clone(a));
      continue;
    }
    const rounded = roundedPolygon([at(anchors, i - 1).p, a.p, at(anchors, i + 1).p], [0, a.cornerRadius ?? 0, 0]);
    // roundedPolygon keeps the two outer vertices as anchors: only the middle corner's pair is wanted.
    const pair = rounded.anchors.slice(1, rounded.anchors.length - 1);
    out.push(...pair);
  }
  return { anchors: out, closed };
}

/**
 * Cuts an open path at several anchors at once (positions strictly inside it), leaving coincident
 * anchors at each cut. A closed path is first opened at its first cut position.
 */
export function splitAtAnchors(anchors: readonly Anchor[], closed: boolean, positions: readonly number[]): Anchor[][] {
  const n = anchors.length;
  const sorted = [...new Set(positions)].filter((i) => i >= 0 && i < n).sort((a, b) => a - b);
  if (sorted.length === 0) return [anchors.map(clone)];
  let open = anchors.map(clone);
  let cuts = sorted;
  if (closed) {
    const first = sorted[0] as number;
    const opened = cutPath(anchors, true, { anchor: first });
    if (!opened || !opened[0]) return [anchors.map(clone)];
    open = opened[0];
    cuts = sorted.slice(1).map((j) => j - first + (j < first ? n : 0));
  }
  const inner = cuts.filter((p) => p > 0 && p < open.length - 1);
  const pieces: Anchor[][] = [];
  let start = 0;
  for (const p of inner) {
    const here = open[p] as Anchor;
    pieces.push([...open.slice(start, p), { ...clone(here), out: null }]);
    start = p;
    open[p] = { ...clone(here), in: null };
  }
  pieces.push(open.slice(start));
  return pieces;
}

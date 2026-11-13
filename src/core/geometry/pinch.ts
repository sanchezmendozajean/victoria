import type { Anchor, Vec2 } from '../model/types';
import { insertAnchor } from './anchors';
import { projectOnSegment } from './edit';
import { flattenSubPath, segmentsOf, type SubPath } from './path';

// A closed contour that touches itself at a point (a "pinch") draws two areas joined by a point of zero width:
// two circles tangent to the edges of a rectangle leave its corner pinched to the rest. Boolean results keep such
// contours whole; the Shape Builder and Divide must see each area as its own region, so they are split here.

/** Pinch tolerance in document points: well below anything drawn, above the noise of boolean results. */
export const PINCH_EPSILON = 1e-3;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const copy = (a: Anchor): Anchor => ({ ...a, p: { ...a.p }, in: a.in && { ...a.in }, out: a.out && { ...a.out } });

/** Splits a closed contour wherever it touches itself; returns it unchanged (as the only element) when it does not. */
export function splitPinchedContour(sub: SubPath, eps = PINCH_EPSILON): SubPath[] {
  if (!sub.closed || sub.anchors.length < 4) return [sub];
  let anchors = sub.anchors.map(copy);
  // An anchor lying on a segment it does not belong to: put an anchor there, so the pinch becomes two equal anchors.
  for (let guard = 0; guard < 64; guard++) {
    const hit = anchorOnForeignSegment(anchors, eps);
    if (!hit) break;
    const inserted = insertAnchor(anchors, true, hit.segment, hit.t);
    // Exactly on the pinch (the projection is approximate): the new anchor and its handles move onto it.
    const added = inserted.anchors[inserted.index];
    if (added) {
      const dx = hit.p.x - added.p.x;
      const dy = hit.p.y - added.p.y;
      inserted.anchors[inserted.index] = { ...added, p: { ...hit.p }, in: added.in && { x: added.in.x + dx, y: added.in.y + dy }, out: added.out && { x: added.out.x + dx, y: added.out.y + dy } };
    }
    anchors = inserted.anchors;
  }
  const n = anchors.length;
  for (let i = 0; i < n; i++) {
    for (let k = i + 2; k < n; k++) {
      if (i === 0 && k === n - 1) continue; // neighbours across the closing segment
      const a = anchors[i] as Anchor;
      const b = anchors[k] as Anchor;
      if (dist(a.p, b.p) > eps) continue;
      // Loop 1: i … k−1, back into the pinch with k's incoming handle. Loop 2: k … i−1, back with i's.
      const first: Anchor[] = [{ ...copy(a), in: b.in && { ...b.in } }, ...anchors.slice(i + 1, k).map(copy)];
      const second: Anchor[] = [{ ...copy(b), in: a.in && { ...a.in } }, ...anchors.slice(k + 1).map(copy), ...anchors.slice(0, i).map(copy)];
      return [first, second].filter((loop) => loop.length >= 2 && Math.abs(areaOf({ anchors: loop, closed: true })) > eps * eps).flatMap((loop) => splitPinchedContour({ anchors: loop, closed: true }, eps));
    }
  }
  return [sub]; // no pinch: the contour as it came (without the anchors inserted while looking)
}

function anchorOnForeignSegment(anchors: readonly Anchor[], eps: number): { segment: number; t: number; p: Vec2 } | null {
  const segments = segmentsOf({ anchors: anchors as Anchor[], closed: true });
  const n = anchors.length;
  for (let i = 0; i < n; i++) {
    const p = (anchors[i] as Anchor).p;
    for (let j = 0; j < segments.length; j++) {
      // Segment j runs from anchor j to anchor j+1: skip the two that start or end at anchor i.
      if (j === i || (j + 1) % n === i) continue;
      const s = segments[j]!;
      const minX = Math.min(s.p0.x, s.c1.x, s.c2.x, s.p3.x) - eps;
      const maxX = Math.max(s.p0.x, s.c1.x, s.c2.x, s.p3.x) + eps;
      const minY = Math.min(s.p0.y, s.c1.y, s.c2.y, s.p3.y) - eps;
      const maxY = Math.max(s.p0.y, s.c1.y, s.c2.y, s.p3.y) + eps;
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
      const hit = projectOnSegment(s, p);
      // On the segment, not at one of its ends (an anchor already sits there: that case is handled as equal anchors).
      if (hit.distance <= eps && dist(hit.point, s.p0) > eps && dist(hit.point, s.p3) > eps) return { segment: j, t: hit.t, p: { ...p } };
    }
  }
  return null;
}

/** Signed area of a closed contour (flattened). */
export function areaOf(sub: SubPath): number {
  const pts = flattenSubPath(sub, 0.05).points;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Whether `p` is inside a closed contour (even-odd on its flattened outline). */
export function insideContour(sub: SubPath, p: Vec2): boolean {
  const pts = flattenSubPath(sub, 0.05).points;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

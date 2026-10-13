import type { Vec2 } from '../model/types';
import { flattenSubPath, type Polyline } from './path';
import type { NodeGeometry } from './geometry';

/** Flattened contours for hit testing. `tolerance` is the maximum chord error in local units. */
export function flattenGeometry(geometry: NodeGeometry, tolerance: number): Polyline[] {
  return geometry.subpaths.map((s) => flattenSubPath(s, tolerance));
}

/** Winding number of `p` around a closed polyline (open contours are closed for filling). */
function winding(points: readonly Vec2[], p: Vec2): number {
  let wn = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const a = points[i] as Vec2;
    const b = points[(i + 1) % n] as Vec2;
    if (a.y <= p.y) {
      if (b.y > p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) > 0) wn++;
    } else if (b.y <= p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) < 0) {
      wn--;
    }
  }
  return wn;
}

/** Is `p` inside the filled area? Holes of compound paths follow the fill rule. */
export function pointInFill(polylines: readonly Polyline[], p: Vec2, rule: 'nonzero' | 'evenodd'): boolean {
  if (rule === 'nonzero') {
    let total = 0;
    for (const line of polylines) total += winding(line.points, p);
    return total !== 0;
  }
  let crossings = 0;
  for (const line of polylines) {
    const pts = line.points;
    for (let i = 0, n = pts.length; i < n; i++) {
      const a = pts[i] as Vec2;
      const b = pts[(i + 1) % n] as Vec2;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) crossings++;
    }
  }
  return crossings % 2 === 1;
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance from `p` to the outline. Closed contours include their closing edge. */
export function distanceToOutline(polylines: readonly Polyline[], p: Vec2): number {
  let best = Infinity;
  for (const line of polylines) {
    const pts = line.points;
    const edges = line.closed ? pts.length : pts.length - 1;
    if (pts.length === 1) best = Math.min(best, Math.hypot(p.x - (pts[0] as Vec2).x, p.y - (pts[0] as Vec2).y));
    for (let i = 0; i < edges; i++) {
      best = Math.min(best, distanceToSegment(p, pts[i] as Vec2, pts[(i + 1) % pts.length] as Vec2));
    }
  }
  return best;
}

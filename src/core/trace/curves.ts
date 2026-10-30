import type { Anchor, Vec2 } from '../model/types';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Distance from p to the segment a-b. */
function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Ramer-Douglas-Peucker on an open run of a loop (indices `from`..`to`, wrapping), without recursion. */
function simplifyRun(points: readonly Vec2[], from: number, to: number, tolerance: number, keep: Uint8Array): void {
  const n = points.length;
  const stack: Array<[number, number]> = [[from, to]];
  while (stack.length > 0) {
    const [i, j] = stack.pop() as [number, number];
    const a = points[i % n] as Vec2;
    const b = points[j % n] as Vec2;
    let far = -1;
    let farD = tolerance;
    for (let k = i + 1; k < j; k++) {
      const d = segmentDistance(points[k % n] as Vec2, a, b);
      if (d > farD) {
        farD = d;
        far = k;
      }
    }
    if (far < 0) continue;
    keep[far % n] = 1;
    stack.push([i, far], [far, j]);
  }
}

/** The closed outline reduced to the points that matter within `tolerance` pixels. */
export function simplifyLoop(points: readonly Vec2[], tolerance: number): Vec2[] {
  const n = points.length;
  if (n <= 3) return [...points];
  // Anchor the loop at point 0 and the point farthest from it, then simplify each half.
  let far = 1;
  for (let i = 2; i < n; i++) if (dist(points[i] as Vec2, points[0] as Vec2) > dist(points[far] as Vec2, points[0] as Vec2)) far = i;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[far] = 1;
  simplifyRun(points, 0, far, tolerance, keep);
  simplifyRun(points, far, n, tolerance, keep);
  return points.filter((_, i) => keep[i] === 1);
}

/** With `snapLines`, a bend of less than this (radians, 8°) stays straight. */
const SNAP_TURN = (8 * Math.PI) / 180;

/** How far from a corner a curve may start, in pixels: sharp features stay sharp, long sides stay straight. */
const ROUNDING = 6;

/**
 * A closed polygon as Bézier anchors: a vertex that turns more than the corner threshold stays a corner; the others
 * become curves that leave the sides a little before the vertex and meet in a smooth bend (the vertex pulls the curve).
 */
export function polygonToAnchors(polygon: readonly Vec2[], corners: number, snapLines = false): Anchor[] {
  const n = polygon.length;
  const limit = ((105 - 0.75 * Math.max(0, Math.min(100, corners))) * Math.PI) / 180;
  const anchors: Anchor[] = [];
  const corner = (p: Vec2, inH: Vec2 | null, outH: Vec2 | null): Anchor => ({ p, in: inH, out: outH, kind: 'corner' });
  for (let j = 0; j < n; j++) {
    const prev = polygon[(j + n - 1) % n] as Vec2;
    const v = polygon[j] as Vec2;
    const next = polygon[(j + 1) % n] as Vec2;
    const lenIn = dist(prev, v);
    const lenOut = dist(v, next);
    const turn = Math.abs(Math.atan2((v.x - prev.x) * (next.y - v.y) - (v.y - prev.y) * (next.x - v.x), (v.x - prev.x) * (next.x - v.x) + (v.y - prev.y) * (next.y - v.y)));
    if (turn > limit || lenIn === 0 || lenOut === 0 || (snapLines && turn < SNAP_TURN)) {
      anchors.push(corner(v, null, null));
      continue;
    }
    const tIn = Math.min(0.5, ROUNDING / lenIn);
    const tOut = Math.min(0.5, ROUNDING / lenOut);
    const a = { x: v.x + (prev.x - v.x) * tIn, y: v.y + (prev.y - v.y) * tIn };
    const b = { x: v.x + (next.x - v.x) * tOut, y: v.y + (next.y - v.y) * tOut };
    const toward = (from: Vec2) => ({ x: from.x + (v.x - from.x) * (2 / 3), y: from.y + (v.y - from.y) * (2 / 3) });
    anchors.push(corner(a, null, toward(a)), corner(b, toward(b), null));
  }
  return anchors;
}

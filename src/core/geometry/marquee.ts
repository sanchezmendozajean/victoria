import type { Matrix, Node, Space, Vec2 } from '../model/types';
import { applyToPoint } from '../model/matrix';
import { geometricBoundsInParent, hasFill, nodeGeometry } from './geometry';
import { flattenGeometry, pointInFill } from './hit';
import { containsPoint, intersects, transformRect, type Rect } from './rect';
import { indexFor, type IndexItem } from './spatial-index';
import { pathsOfNodes } from './world';

export interface MarqueeOptions {
  /** `touch`: anything the marquee touches is selected (default, as in Illustrator). `contain`: only what is fully inside. */
  mode?: 'touch' | 'contain';
  includeLocked?: boolean;
  /** Group being edited in isolation: only its contents can be selected. */
  isolation?: string | null;
  /** Pick tolerance in Space units for thin strokes. */
  tolerance?: number;
}

function segmentsCross(a: Vec2, b: Vec2, r: Rect): boolean {
  // Liang–Barsky clipping of the segment against the rectangle.
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const checks: Array<[number, number]> = [
    [-dx, a.x - r.minX],
    [dx, r.maxX - a.x],
    [-dy, a.y - r.minY],
    [dy, r.maxY - a.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

/** Does the painted shape of a leaf touch the rectangle (outline crossing it, or its area covering it)? */
function touches(item: IndexItem, rect: Rect, tolerance: number): boolean {
  const geometry = nodeGeometry(item.node);
  if (!geometry) return false;
  const world: Matrix = item.world;
  const scale = Math.sqrt(Math.abs(world[0] * world[3] - world[1] * world[2])) || 1;
  const lines = flattenGeometry(geometry, Math.max(tolerance / scale / 4, 1e-4));
  for (const line of lines) {
    const pts = line.points.map((p) => applyToPoint(world, p));
    const edges = line.closed ? pts.length : pts.length - 1;
    if (pts.length === 1 && containsPoint(rect, pts[0] as Vec2)) return true;
    for (let i = 0; i < edges; i++) {
      if (segmentsCross(pts[i] as Vec2, pts[(i + 1) % pts.length] as Vec2, rect)) return true;
    }
  }
  // Fully inside a filled shape (the marquee is smaller than the shape and crosses no outline).
  if (item.node.type === 'image' || hasFill(item.node.appearance)) {
    const inverse = invertSafe(world);
    if (inverse && pointInFill(lines, applyToPoint(inverse, { x: (rect.minX + rect.maxX) / 2, y: (rect.minY + rect.maxY) / 2 }), geometry.fillRule)) return true;
  }
  return false;
}

function invertSafe(m: Matrix): Matrix | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (det === 0) return null;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

/**
 * What a selection marquee picks: the outermost group (or the object itself) of every leaf it
 * touches, in paint order. Hidden and locked objects are skipped.
 */
export function marqueeTargets(space: Space, rect: Rect, options: MarqueeOptions = {}): Node[] {
  const { mode = 'touch', includeLocked = false, isolation = null, tolerance = 0.5 } = options;
  const found = new Map<string, { node: Node; order: number }>();
  for (const item of indexFor(space).search(rect)) {
    if (item.locked && !includeLocked) continue;
    let target: Node;
    if (isolation) {
      const depth = item.ancestors.findIndex((a) => a.id === isolation);
      if (depth === -1) continue;
      target = item.ancestors[depth + 1] ?? item.node;
    } else {
      target = item.ancestors[0] ?? item.node;
    }
    const inside =
      mode === 'contain'
        ? (() => {
            const own = geometricBoundsInParent(item.node);
            if (!own) return false;
            const world = transformRect(parentOf(item), own);
            return world.minX >= rect.minX && world.maxX <= rect.maxX && world.minY >= rect.minY && world.maxY <= rect.maxY;
          })()
        : intersects(item, rect) && touches(item, rect, tolerance);
    if (inside && !found.has(target.id)) found.set(target.id, { node: target, order: item.order });
    else if (inside) found.get(target.id)!.order = Math.max(found.get(target.id)!.order, item.order);
  }
  return [...found.values()].sort((a, b) => a.order - b.order).map((f) => f.node);
}

/** Matrix from the parent of an indexed leaf to the Space (world without the leaf's own transform). */
function parentOf(item: IndexItem): Matrix {
  const inv = invertSafe(item.node.transform);
  if (!inv) return item.world;
  // world = parentWorld × transform  →  parentWorld = world × transform⁻¹
  const [a, b, c, d, e, f] = item.world;
  const [ia, ib, ic, id, ie, if_] = inv;
  return [a * ia + c * ib, b * ia + d * ib, a * ic + c * id, b * ic + d * id, a * ie + c * if_ + e, b * ie + d * if_ + f];
}

export interface AnchorRef {
  pathId: string;
  index: number;
  /** Position in Space coordinates. */
  position: Vec2;
}

/** Anchors of the given objects inside a rectangle (direct-selection marquee). */
export function anchorsInRect(space: Space, objectIds: readonly string[], rect: Rect): AnchorRef[] {
  const out: AnchorRef[] = [];
  for (const frame of pathsOfNodes(space, objectIds)) {
    frame.path.anchors.forEach((anchor, index) => {
      const position = applyToPoint(frame.world, anchor.p);
      if (containsPoint(rect, position)) out.push({ pathId: frame.path.id, index, position });
    });
  }
  return out;
}

export function pointInPolygon(p: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i] as Vec2;
    const b = polygon[j] as Vec2;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Anchors inside a free-form lasso (the Lasso tool selects anchors, like Illustrator). */
export function anchorsInPolygon(space: Space, objectIds: readonly string[], polygon: readonly Vec2[]): AnchorRef[] {
  const out: AnchorRef[] = [];
  for (const frame of pathsOfNodes(space, objectIds)) {
    frame.path.anchors.forEach((anchor, index) => {
      const position = applyToPoint(frame.world, anchor.p);
      if (pointInPolygon(position, polygon)) out.push({ pathId: frame.path.id, index, position });
    });
  }
  return out;
}

/** Every visible, unlocked leaf object whose bounds meet `rect` (candidates for anchor picking). */
export function visibleLeafIds(space: Space, rect: Rect, includeLocked = false): string[] {
  return indexFor(space)
    .search(rect)
    .filter((i) => includeLocked || !i.locked)
    .map((i) => i.id);
}

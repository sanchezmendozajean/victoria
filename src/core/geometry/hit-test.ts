import { invert } from '../model/matrix';
import type { Layer, Matrix, Node, Space, Vec2 } from '../model/types';
import { applyToPoint } from '../model/matrix';
import { hasFill, hitGeometry, nodeGeometry, strokesOf } from './geometry';
import { distanceToOutline, flattenGeometry, pointInFill } from './hit';
import { indexFor, type IndexItem } from './spatial-index';

export interface HitOptions {
  /** Pick radius in Space units (screen pixels / zoom): strokes thinner than this are still easy to hit. */
  tolerance: number;
  /** Also report locked objects (default false: locked objects cannot be picked). */
  includeLocked?: boolean;
  /** Group being edited in isolation: only objects inside it can be hit. */
  isolation?: string | null;
}

export interface Hit {
  id: string;
  node: Node;
  /** What was under the cursor: the painted area or the outline. */
  part: 'fill' | 'stroke';
  /** Containing groups, outermost first. */
  ancestors: Node[];
  layer: Layer;
  /** Local → Space matrix of the hit object. */
  world: Matrix;
}

/** Local-space point, and the scale to convert Space lengths into local ones. */
function toLocal(world: Matrix, p: Vec2): { point: Vec2; scale: number } | null {
  const inv = invert(world);
  if (!inv) return null;
  return { point: applyToPoint(inv, p), scale: Math.sqrt(Math.abs(world[0] * world[3] - world[1] * world[2])) };
}

function insideMask(item: IndexItem, p: Vec2, tolerance: number): boolean {
  return item.clips.every((clip) => {
    const geometry = nodeGeometry(clip.mask);
    const local = toLocal(clip.world, p);
    if (!geometry || !local) return false;
    const flat = flattenGeometry(geometry, tolerance / local.scale / 4 || 0.01);
    return pointInFill(flat, local.point, geometry.fillRule);
  });
}

function testItem(item: IndexItem, p: Vec2, tolerance: number): Hit | null {
  const geometry = hitGeometry(item.node);
  if (!geometry) return null;
  const local = toLocal(item.world, p);
  if (!local || local.scale === 0) return null;
  const tolLocal = tolerance / local.scale;
  const flat = flattenGeometry(geometry, Math.max(tolLocal / 4, 1e-4));
  const base = { id: item.id, node: item.node, ancestors: item.ancestors, layer: item.layer, world: item.world };

  const inside = hasFill(item.node.appearance) && pointInFill(flat, local.point, geometry.fillRule);
  const strokes = strokesOf(item.node.appearance);
  if (strokes.length > 0) {
    const distance = distanceToOutline(flat, local.point);
    const geometryInside = inside || pointInFill(flat, local.point, geometry.fillRule);
    for (const stroke of strokes) {
      const half = stroke.width / 2;
      const reach = stroke.align === 'center' ? half : stroke.width;
      const onSide = stroke.align === 'center' || (stroke.align === 'inside' ? geometryInside : !geometryInside);
      if (onSide && distance <= reach + tolLocal) return { ...base, part: 'stroke' };
    }
  }
  return inside ? { ...base, part: 'fill' } : null;
}

/**
 * Objects under `point`, topmost first. A filled object is hit inside its area (holes of compound
 * paths excluded), any object with a stroke is hit on its outline; unpainted areas are empty space.
 */
export function hitTest(space: Space, point: Vec2, options: HitOptions): Hit[] {
  const { tolerance, includeLocked = false, isolation = null } = options;
  const hits: Hit[] = [];
  for (const item of indexFor(space).atPoint(point, tolerance)) {
    if (item.locked && !includeLocked) continue;
    if (isolation && !item.ancestors.some((a) => a.id === isolation)) continue;
    const hit = testItem(item, point, tolerance);
    if (hit && insideMask(item, point, tolerance)) hits.push(hit);
  }
  return hits;
}

/**
 * What a click selects: the outermost group of the hit object, or the object itself. While a group is
 * isolated, the unit is the child of that group that holds the hit (null when the hit is outside it).
 */
export function selectionTarget(hit: Hit, isolation: string | null = null): Node | null {
  if (!isolation) return hit.ancestors[0] ?? hit.node;
  const depth = hit.ancestors.findIndex((a) => a.id === isolation);
  return depth === -1 ? null : (hit.ancestors[depth + 1] ?? hit.node);
}

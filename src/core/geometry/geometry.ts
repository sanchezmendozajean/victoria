import { multiply } from '../model/matrix';
import type { Appearance, Layer, LayerChild, Matrix, Node, StrokeStyle } from '../model/types';
import { isLayer } from '../model/queries';
import { applyCornerRadii } from './anchors';
import { subPathBounds, type SubPath } from './path';
import { inflateRect, transformRect, unionRect, type Rect } from './rect';
import { shapeSubPaths } from './shapes';

export interface NodeGeometry {
  subpaths: SubPath[];
  fillRule: 'nonzero' | 'evenodd';
}

const cache = new WeakMap<Node, NodeGeometry | null>();

/**
 * Contours of a leaf object in its local space. Groups and text have none here (text arrives with
 * the text engine in Phase 7). Cached per node: nodes are immutable, so identity is the key.
 */
export function nodeGeometry(node: Node): NodeGeometry | null {
  if (cache.has(node)) return cache.get(node) as NodeGeometry | null;
  let geometry: NodeGeometry | null;
  switch (node.type) {
    case 'path':
      geometry = { subpaths: [applyCornerRadii({ anchors: node.anchors, closed: node.closed })], fillRule: 'nonzero' };
      break;
    case 'compound':
      geometry = { subpaths: node.children.map((c) => applyCornerRadii({ anchors: c.anchors, closed: c.closed })), fillRule: node.fillRule };
      break;
    case 'shape':
      geometry = { subpaths: shapeSubPaths(node), fillRule: 'nonzero' };
      break;
    case 'image': {
      const corner = (x: number, y: number) => ({ p: { x, y }, in: null, out: null, kind: 'corner' as const });
      geometry = {
        subpaths: [{ anchors: [corner(0, 0), corner(node.width, 0), corner(node.width, node.height), corner(0, node.height)], closed: true }],
        fillRule: 'nonzero',
      };
      break;
    }
    default:
      geometry = null;
  }
  cache.set(node, geometry);
  return geometry;
}

export function geometryBounds(geometry: NodeGeometry): Rect | null {
  let rect: Rect | null = null;
  for (const sub of geometry.subpaths) rect = unionRect(rect, subPathBounds(sub));
  return rect;
}

export const strokesOf = (appearance: Appearance): StrokeStyle[] =>
  appearance.items.flatMap((i) => (i.kind === 'stroke' && i.paint.type !== 'none' && i.opacity > 0 ? [i.stroke] : []));

export const hasFill = (appearance: Appearance): boolean =>
  appearance.items.some((i) => i.kind === 'fill' && i.paint.type !== 'none' && i.opacity > 0);

/** Conservative growth of the bounds caused by strokes (miter joins can reach `miterLimit` × half width). */
function strokeInflation(appearance: Appearance): number {
  let d = 0;
  for (const s of strokesOf(appearance)) {
    const reach = s.join === 'miter' ? Math.min(Math.max(s.miterLimit, 1), 10) : 1;
    d = Math.max(d, (s.width / 2) * reach * (s.cap === 'square' ? Math.SQRT2 : 1));
  }
  return d;
}

const boundsCache = new WeakMap<Node, Rect | null>();
const geometricCache = new WeakMap<Node, Rect | null>();

function computeBounds(node: Node, withStroke: boolean): Rect | null {
  const cache = withStroke ? boundsCache : geometricCache;
  if (cache.has(node)) return cache.get(node) as Rect | null;
  let local: Rect | null = null;
  if (node.type === 'group' || node.type === 'clipGroup') {
    // A clip group shows only what the mask (first child) covers.
    const members = node.type === 'clipGroup' ? node.children.slice(0, 1) : node.children;
    for (const child of members) local = unionRect(local, computeBounds(child, withStroke));
  } else {
    const geometry = nodeGeometry(node);
    local = geometry ? geometryBounds(geometry) : null;
    if (local && withStroke) local = inflateRect(local, strokeInflation(node.appearance));
  }
  const result = local ? transformRect(node.transform, local) : null;
  cache.set(node, result);
  return result;
}

/**
 * Bounds of an object in the coordinate system of its parent (its own transform applied), including
 * strokes and, for groups, everything inside ("visible bounds"). Cached per immutable node.
 */
export const boundsInParent = (node: Node): Rect | null => computeBounds(node, true);

/** Same without strokes: what Illustrator's bounding box shows by default ("geometric bounds"). */
export const geometricBoundsInParent = (node: Node): Rect | null => computeBounds(node, false);

/** Union of everything a layer (and its sublayers) holds, in Space coordinates. */
export function layerBounds(layer: Layer): Rect | null {
  let rect: Rect | null = null;
  for (const child of layer.children) rect = unionRect(rect, childBounds(child));
  return rect;
}

export function childBounds(child: LayerChild): Rect | null {
  return isLayer(child) ? layerBounds(child) : boundsInParent(child);
}

export function composeMatrices(chain: readonly Matrix[]): Matrix {
  return chain.reduce<Matrix>((acc, m) => multiply(acc, m), [1, 0, 0, 1, 0, 0]);
}

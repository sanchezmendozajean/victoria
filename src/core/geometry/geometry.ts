import { multiply } from '../model/matrix';
import type { Appearance, Layer, LayerChild, Matrix, Node, StrokeStyle } from '../model/types';
import { isLayer } from '../model/queries';
import { applyCornerRadii } from './anchors';
import { subPathBounds, type SubPath } from './path';
import { inflateRect, transformRect, unionRect, type Rect } from './rect';
import { shapeSubPaths } from './shapes';
import { textGeometry, type TextGeometry } from '../text/geometry';

export interface NodeGeometry {
  subpaths: SubPath[];
  fillRule: 'nonzero' | 'evenodd';
}

const cache = new WeakMap<Node, NodeGeometry | null>();

/**
 * Contours of a leaf object in its local space. Groups and text have none here (text arrives with
 * the text engine in Phase 7). Cached per node: nodes are immutable, so identity is the key.
 */
const textWrappers = new WeakMap<TextGeometry, NodeGeometry>();

/** Contours of a text object: its glyphs. Cached per layout, which changes when the node or the loaded fonts do. */
function textNodeGeometry(node: Extract<Node, { type: 'text' }>): NodeGeometry {
  const g = textGeometry(node);
  let wrapped = textWrappers.get(g);
  if (!wrapped) {
    wrapped = { subpaths: g.subpaths, fillRule: 'nonzero' };
    textWrappers.set(g, wrapped);
  }
  return wrapped;
}

const textHitWrappers = new WeakMap<TextGeometry, NodeGeometry>();

/** What a click can hit: the line boxes (or the frame) of text, the painted contours of everything else. */
export function hitGeometry(node: Node): NodeGeometry | null {
  if (node.type !== 'text') return renderGeometry(node);
  const g = textGeometry(node);
  let wrapped = textHitWrappers.get(g);
  if (!wrapped) {
    wrapped = { subpaths: g.boxes.map((poly) => ({ anchors: poly.map((p) => ({ p, in: null, out: null, kind: 'corner' as const })), closed: true })), fillRule: 'nonzero' };
    textHitWrappers.set(g, wrapped);
  }
  return wrapped;
}

/**
 * What the modifiers module plugs in (it imports this file, so it registers itself here): the contours an
 * object is painted and picked with once its modifiers are applied, and the room its effects need.
 */
export interface RenderOverride {
  geometry(node: Node): NodeGeometry | null;
  /** True for a group drawn as one shape (live pathfinder) instead of through its children. */
  groupAsShape(node: Node): boolean;
  /** Extra room around the geometry for shadows and glows. */
  margin(node: Node): number;
}
let renderOverride: RenderOverride | null = null;
export const setRenderOverride = (override: RenderOverride | null): void => {
  renderOverride = override;
};
export const isGroupShape = (node: Node): boolean => renderOverride?.groupAsShape(node) === true;
/** Contours to paint and pick: the evaluated ones when the object has modifiers, else the base contours. */
export const renderGeometry = (node: Node): NodeGeometry | null => renderOverride?.geometry(node) ?? nodeGeometry(node);

export function nodeGeometry(node: Node): NodeGeometry | null {
  if (node.type === 'text') return textNodeGeometry(node);
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
  // Text depends on the loaded fonts, so its bounds are not cached here (textGeometry caches the layout).
  if (node.type !== 'text' && cache.has(node)) return cache.get(node) as Rect | null;
  let local: Rect | null = null;
  if ((node.type === 'group' || node.type === 'clipGroup') && !(withStroke && isGroupShape(node))) {
    // A clip group shows only what the mask (first child) covers.
    const members = node.type === 'clipGroup' ? node.children.slice(0, 1) : node.children;
    for (const child of members) local = unionRect(local, computeBounds(child, withStroke));
  } else if (node.type === 'text') {
    local = textGeometry(node).bounds;
    if (local && withStroke) local = inflateRect(local, strokeInflation(node.appearance));
  } else {
    // Visible bounds follow the modifiers (and the room their effects need); geometric bounds stay on the base contours.
    const geometry = withStroke ? renderGeometry(node) : nodeGeometry(node);
    local = geometry ? geometryBounds(geometry) : null;
    if (local && withStroke) local = inflateRect(local, strokeInflation(node.appearance) + (renderOverride?.margin(node) ?? 0));
  }
  const result = local ? transformRect(node.transform, local) : null;
  if (node.type !== 'text') cache.set(node, result);
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

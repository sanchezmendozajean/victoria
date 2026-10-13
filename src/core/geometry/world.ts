import { invert, multiply } from '../model/matrix';
import { isLayer } from '../model/queries';
import type { Anchor, Layer, LayerChild, Matrix, Node, PathNode, Space, Vec2 } from '../model/types';
import { applyToPoint } from '../model/matrix';
import { boundsInParent, geometricBoundsInParent } from './geometry';
import { shapeSubPaths } from './shapes';
import { transformRect, unionRect, type Rect } from './rect';

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Where a node sits in the Space: everything needed to go between its local space and the Space's. */
export interface NodeFrame {
  node: Node;
  /** Local → Space (all ancestor groups and the node's own transform). */
  world: Matrix;
  /** Space ← the node's parent (ancestor groups only). */
  parentWorld: Matrix;
  /** Containing groups, outermost first. */
  ancestors: Node[];
  layer: Layer;
}

function search(children: readonly LayerChild[], id: string, parentWorld: Matrix, ancestors: Node[], layer: Layer): NodeFrame | null {
  for (const child of children) {
    if (isLayer(child)) {
      const found = search(child.children, id, parentWorld, ancestors, child);
      if (found) return found;
      continue;
    }
    const world = multiply(parentWorld, child.transform);
    if (child.id === id) return { node: child, world, parentWorld, ancestors, layer };
    if (child.type === 'group' || child.type === 'clipGroup') {
      const found = search(child.children, id, world, [...ancestors, child], layer);
      if (found) return found;
    }
  }
  return null;
}

/** Position of any node (also inside groups and sublayers) in its Space. */
export function frameOf(space: Space, id: string): NodeFrame | null {
  for (const layer of space.layers) {
    const found = search(layer.children, id, IDENTITY, [], layer);
    if (found) return found;
  }
  return null;
}

const virtualPaths = new WeakMap<Node, PathNode | null>();

/** The contour of a live shape as a path (same id, so selected anchors keep pointing at it after conversion). */
function virtualPath(shape: Node): PathNode | null {
  if (shape.type !== 'shape') return null;
  if (virtualPaths.has(shape)) return virtualPaths.get(shape) ?? null;
  const [contour] = shapeSubPaths(shape);
  const { shape: _kind, params: _params, type: _type, ...base } = shape;
  void _kind;
  void _params;
  void _type;
  const path = contour ? ({ ...base, type: 'path', closed: contour.closed, anchors: contour.anchors } as PathNode) : null;
  virtualPaths.set(shape, path);
  return path;
}

/** A path anywhere in the Space: standalone, or a sub-path of a compound path (whose transform it shares). */
export interface PathFrame {
  /** For a live shape this is a virtual path with the same id (its contour), editable only after conversion. */
  path: PathNode;
  /** True for live shapes (rectangle, ellipse…): editing their nodes converts them to a path first. */
  live: boolean;
  /** The object the path belongs to (the path itself, or its compound parent). */
  owner: Node;
  world: Matrix;
  layer: Layer;
}

export function pathFrameOf(space: Space, id: string): PathFrame | null {
  const direct = frameOf(space, id);
  if (direct?.node.type === 'path') return { path: direct.node, live: false, owner: direct.node, world: direct.world, layer: direct.layer };
  if (direct?.node.type === 'shape') {
    const path = virtualPath(direct.node);
    return path ? { path, live: true, owner: direct.node, world: direct.world, layer: direct.layer } : null;
  }
  for (const layer of space.layers) {
    const found = searchCompound(layer.children, id, IDENTITY, layer);
    if (found) return found;
  }
  return null;
}

function searchCompound(children: readonly LayerChild[], id: string, parentWorld: Matrix, layer: Layer): PathFrame | null {
  for (const child of children) {
    if (isLayer(child)) {
      const found = searchCompound(child.children, id, parentWorld, child);
      if (found) return found;
      continue;
    }
    const world = multiply(parentWorld, child.transform);
    if (child.type === 'compound') {
      const path = child.children.find((p) => p.id === id);
      if (path) return { path, live: false, owner: child, world, layer };
    } else if (child.type === 'group' || child.type === 'clipGroup') {
      const found = searchCompound(child.children, id, world, layer);
      if (found) return found;
    }
  }
  return null;
}

/** Path objects (and compound sub-paths) of the given objects, with the frame of their owner. */
export function pathsOfNodes(space: Space, ids: readonly string[]): PathFrame[] {
  const out: PathFrame[] = [];
  for (const id of ids) {
    const frame = frameOf(space, id);
    if (!frame) continue;
    collectPaths(frame.node, frame.world, frame.layer, out);
  }
  return out;
}

function collectPaths(node: Node, world: Matrix, layer: Layer, out: PathFrame[]): void {
  if (node.type === 'path') out.push({ path: node, live: false, owner: node, world, layer });
  else if (node.type === 'shape') {
    const path = virtualPath(node);
    if (path) out.push({ path, live: true, owner: node, world, layer });
  } else if (node.type === 'compound') for (const path of node.children) out.push({ path, live: false, owner: node, world, layer });
  else if (node.type === 'group' || node.type === 'clipGroup') {
    for (const child of node.children) collectPaths(child, multiply(world, child.transform), layer, out);
  }
}

/** World position of an anchor (or of one of its handles). */
export const anchorToWorld = (world: Matrix, p: Vec2): Vec2 => applyToPoint(world, p);

export function worldToLocal(world: Matrix, p: Vec2): Vec2 {
  const inv = invert(world);
  return inv ? applyToPoint(inv, p) : p;
}

export interface BoundsOptions {
  /** Include strokes ("preview bounds"). Default false, like Illustrator. */
  stroke?: boolean;
}

/** Bounds in Space coordinates of one node. */
export function nodeWorldBounds(space: Space, id: string, options: BoundsOptions = {}): Rect | null {
  const frame = frameOf(space, id);
  if (!frame) return null;
  const local = (options.stroke ? boundsInParent : geometricBoundsInParent)(frame.node);
  return local ? transformRect(frame.parentWorld, local) : null;
}

/** Union of the bounds of several nodes, in Space coordinates (the selection's bounding box). */
export function selectionBounds(space: Space, ids: readonly string[], options: BoundsOptions = {}): Rect | null {
  let rect: Rect | null = null;
  for (const id of ids) rect = unionRect(rect, nodeWorldBounds(space, id, options));
  return rect;
}

export const rectCenter = (r: Rect): Vec2 => ({ x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 });

/** The position of one anchor in Space coordinates. */
export const worldAnchor = (frame: PathFrame, anchor: Anchor): Vec2 => applyToPoint(frame.world, anchor.p);

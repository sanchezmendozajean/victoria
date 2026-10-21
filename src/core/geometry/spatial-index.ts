import { fontEpoch } from '../text/font';
import RBush from 'rbush';
import { multiply } from '../model/matrix';
import { isLayer } from '../model/queries';
import type { Layer, LayerChild, Matrix, Node, Space, Vec2 } from '../model/types';
import { boundsInParent, geometricBoundsInParent, isGroupShape } from './geometry';
import { transformRect, type Rect } from './rect';

/** A visible leaf object with everything hit testing needs; one per leaf, in the R-tree. */
export interface IndexItem extends Rect {
  id: string;
  /** Bounds in Space coordinates without strokes (what alignment and snapping use). */
  geometric: Rect;
  /** Position in the paint order of the whole Space (higher = on top). */
  order: number;
  node: Node;
  /** Local → Space matrix (all ancestor group transforms and the node's own). */
  world: Matrix;
  /** Containing groups, outermost first. */
  ancestors: Node[];
  layer: Layer;
  /** True if the node, a group above it or its layer is locked. */
  locked: boolean;
  /** Clip-group masks that restrict where this object can be hit. */
  clips: Array<{ mask: Node; world: Matrix }>;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** R-tree of one Space (specs/01 · Rendimiento: hit-test < 2 ms with `rbush`). */
export class SpaceIndex {
  private readonly tree = new RBush<IndexItem>(16);
  readonly items: IndexItem[] = [];

  constructor(space: Space) {
    let order = 0;
    const visit = (
      children: readonly LayerChild[],
      layer: Layer,
      parentWorld: Matrix,
      ancestors: Node[],
      locked: boolean,
      clips: IndexItem['clips'],
    ): void => {
      for (const child of children) {
        if (isLayer(child)) {
          if (child.visible) visit(child.children, child, parentWorld, ancestors, locked || child.locked, clips);
          continue;
        }
        if (!child.visible) continue;
        const world = multiply(parentWorld, child.transform);
        const nodeLocked = locked || child.locked;
        if ((child.type === 'group' || child.type === 'clipGroup') && !isGroupShape(child)) {
          const inner = [...ancestors, child];
          if (child.type === 'clipGroup') {
            const [mask, ...rest] = child.children;
            if (!mask) continue;
            visit(rest, layer, world, inner, nodeLocked, [...clips, { mask, world: multiply(world, mask.transform) }]);
          } else {
            visit(child.children, layer, world, inner, nodeLocked, clips);
          }
          continue;
        }
        const bounds = boundsInParent(child);
        if (!bounds) continue;
        const box = transformRect(parentWorld, bounds);
        const own = geometricBoundsInParent(child);
        const geometric = own ? transformRect(parentWorld, own) : box;
        this.items.push({ ...box, geometric, id: child.id, order: order++, node: child, world, ancestors, layer, locked: nodeLocked, clips });
      }
    };
    for (const layer of space.layers) {
      if (layer.visible) visit(layer.children, layer, IDENTITY, [], layer.locked, []);
    }
    this.tree.load(this.items);
  }

  /** Items whose bounds touch `rect`, unordered. */
  search(rect: Rect): IndexItem[] {
    return this.tree.search(rect);
  }

  /** Items whose bounds contain the point (grown by `tolerance`), topmost first. */
  atPoint(p: Vec2, tolerance: number): IndexItem[] {
    return this.tree
      .search({ minX: p.x - tolerance, minY: p.y - tolerance, maxX: p.x + tolerance, maxY: p.y + tolerance })
      .sort((a, b) => b.order - a.order);
  }
}

const indexes = new WeakMap<Space, { epoch: number; index: SpaceIndex }>();

/** Index of an immutable Space, built once per version of it (Immer keeps unchanged Spaces identical). */
export function indexFor(space: Space): SpaceIndex {
  // Text bounds depend on the loaded fonts: the index is rebuilt when the set of fonts changes.
  const epoch = fontEpoch();
  let entry = indexes.get(space);
  if (!entry || entry.epoch !== epoch) {
    entry = { epoch, index: new SpaceIndex(space) };
    indexes.set(space, entry);
  }
  return entry.index;
}

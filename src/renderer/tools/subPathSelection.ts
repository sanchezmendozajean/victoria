import {
  anchorsInFrame,
  combineCommands,
  deepClone,
  distanceToOutline,
  flattenSubPath,
  frameOf,
  intersects,
  multiply,
  pointInFill,
  selectOnly,
  setPathAnchors,
  subPathBounds,
  unionRect,
  withAnchors,
  type Command,
  type CompoundNode,
  type Matrix,
  type PathNode,
  type Rect,
  type Selection,
  type Space,
  type Vec2,
} from '../../core';
import { currentSelection } from './shared';
import type { ToolHost } from './types';

// While a compound path is isolated, the Selection tool treats each of its sub-paths as an object of its own
// (as Illustrator does): a sub-path is "selected" when all of its anchors are, and moves, scales and turns alone.

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export interface IsolatedCompound {
  node: CompoundNode;
  /** Compound local → Space (its sub-paths share it). */
  world: Matrix;
}

/** The isolated object of `space` when it is a compound path. */
export function compoundIn(space: Space, isolation: string | null): IsolatedCompound | null {
  if (!isolation) return null;
  const frame = frameOf(space, isolation);
  return frame && frame.node.type === 'compound' ? { node: frame.node, world: frame.world } : null;
}

export const isolatedCompound = (host: ToolHost): IsolatedCompound | null => (host.space ? compoundIn(host.space, host.isolation) : null);

/** Sub-paths of the compound whose anchors are all selected. */
export function pickedIn(selection: Selection | null, compound: IsolatedCompound): PathNode[] {
  if (!selection || !selection.ids.includes(compound.node.id)) return [];
  return compound.node.children.filter((p) => p.anchors.length > 0 && (selection.anchors?.[p.id]?.length ?? 0) === p.anchors.length);
}

export const pickedSubPaths = (host: ToolHost, compound: IsolatedCompound): PathNode[] => pickedIn(currentSelection(host), compound);

/** Selection holding exactly these sub-paths (all their anchors) of the compound. */
export function subPathSelection(spaceId: string, compound: IsolatedCompound, subs: readonly PathNode[]): Selection {
  if (subs.length === 0) return selectOnly(spaceId, []);
  const anchors: { [pathId: string]: number[] } = {};
  for (const p of subs) anchors[p.id] = p.anchors.map((_, i) => i);
  return withAnchors(selectOnly(spaceId, [compound.node.id]), anchors);
}

const worldSub = (compound: IsolatedCompound, p: PathNode) => ({ anchors: anchorsInFrame(p.anchors, compound.world, IDENTITY), closed: p.closed });

/** Box of the sub-paths on the page (upright). */
export function subPathsBounds(compound: IsolatedCompound, subs: readonly PathNode[]): Rect | null {
  let rect: Rect | null = null;
  for (const p of subs) {
    const r = subPathBounds(worldSub(compound, p));
    if (r) rect = unionRect(rect, r);
  }
  return rect;
}

/** The sub-path under `p`: the one whose outline is nearest within `tolerance`, else the smallest one around the point. */
export function subPathAt(compound: IsolatedCompound, p: Vec2, tolerance: number): PathNode | null {
  let edge: { path: PathNode; d: number } | null = null;
  let inside: { path: PathNode; area: number } | null = null;
  for (const path of compound.node.children) {
    const sub = worldSub(compound, path);
    const line = flattenSubPath(sub, 0.25);
    const d = distanceToOutline([line], p);
    if (d <= tolerance && (!edge || d < edge.d)) edge = { path, d };
    if (path.closed && pointInFill([line], p, 'nonzero')) {
      const r = subPathBounds(sub);
      const area = r ? (r.maxX - r.minX) * (r.maxY - r.minY) : 0;
      if (!inside || area < inside.area) inside = { path, area };
    }
  }
  return edge?.path ?? inside?.path ?? null;
}

/** Sub-paths whose box touches `rect`. */
export function subPathsInRect(compound: IsolatedCompound, rect: Rect): PathNode[] {
  return compound.node.children.filter((p) => {
    const r = subPathBounds(worldSub(compound, p));
    return !!r && intersects(r, rect);
  });
}

/** Applies a Space transform to the sub-paths `ids` of the compound (one merged step under `key`). */
export function transformSubPaths(spaceId: string, compound: IsolatedCompound, ids: readonly string[], step: Matrix, key?: string): Command | null {
  // Local anchors go to the page, take the step, and come back: local′ = world⁻¹ · step · world · local.
  const moved = multiply(step, compound.world);
  const commands = compound.node.children.filter((p) => ids.includes(p.id)).map((p) => setPathAnchors(spaceId, p.id, anchorsInFrame(p.anchors, moved, compound.world), key));
  return commands.length > 0 ? combineCommands('path.edit', commands) : null;
}

/** Copies of `subs` with new ids, transformed by the Space matrix `step` (for duplicateSubPaths). */
export function transformedCopies(compound: IsolatedCompound, subs: readonly PathNode[], step: Matrix, ids: () => string): PathNode[] {
  const moved = multiply(step, compound.world);
  return subs.map((p) => ({ ...deepClone(p), id: ids(), anchors: anchorsInFrame(p.anchors, moved, compound.world) }));
}

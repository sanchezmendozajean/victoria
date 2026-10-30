import { divideShapes, mergePieces, shapeOperation, trimShapes, unitePieces, type BooleanPiece, type BooleanShape, type Face } from '../geometry/booleans';
import { nodeGeometry } from '../geometry/geometry';
import { frameOf } from '../geometry/world';
import { deepClone } from '../model/deepClone';
import { createCompound, createGroup, createPath, defaultStroke } from '../model/factory';
import type { IdGenerator } from '../model/ids';
import { applyToPoint, invert, multiply } from '../model/matrix';
import { isLayer } from '../model/queries';
import type { Anchor, Appearance, AppearanceItem, LayerChild, Matrix, Node, Paint, Space } from '../model/types';
import { combineCommands, type Command } from './command';
import { groupNodes, removeNodes, replaceNode } from './node';
import { newModifier } from './modifiers';

// Pathfinder (specs/06 · Buscatrazos): shape modes and pathfinders over the selected objects. Geometry
// comes from `geometry/booleans.ts` (paper.js, Béziers preserved); here the objects are gathered in paint
// order, the pieces become new objects with the right look, and everything is one reversible command.

export type PathfinderOp = 'unite' | 'minusFront' | 'intersect' | 'exclude' | 'minusBack' | 'divide' | 'trim' | 'merge' | 'crop' | 'outline';

export const SHAPE_MODES: readonly PathfinderOp[] = ['unite', 'minusFront', 'intersect', 'exclude'];
export const PATHFINDERS: readonly PathfinderOp[] = ['divide', 'trim', 'merge', 'crop', 'outline', 'minusBack'];

/** Outlines are hairlines in the colour of the fill they came from. */
export const OUTLINE_WIDTH = 0.25;

export interface Operand {
  shape: BooleanShape;
  appearance: Appearance;
}

const mapAnchor = (m: Matrix, a: Anchor): Anchor => ({ ...a, p: applyToPoint(m, a.p), in: a.in && applyToPoint(m, a.in), out: a.out && applyToPoint(m, a.out) });

/** The drawable leaves under the selected objects, bottom to top, with their contours in Space coordinates. */
function gather(space: Space, ids: ReadonlySet<string>): { operands: Operand[]; owners: string[] } {
  const operands: Operand[] = [];
  const owners: string[] = [];
  const visit = (node: Node, world: Matrix, owner: string | null) => {
    const selfOwner = owner ?? (ids.has(node.id) ? node.id : null);
    if (node.type === 'group' || node.type === 'clipGroup') {
      for (const child of node.children) visit(child, multiply(world, child.transform), selfOwner);
      return;
    }
    if (!selfOwner || !node.visible) return;
    const geometry = nodeGeometry(node);
    if (!geometry || geometry.subpaths.length === 0) return;
    operands.push({
      shape: { fillRule: geometry.fillRule, subpaths: geometry.subpaths.map((sp) => ({ closed: true, anchors: sp.anchors.map((a) => mapAnchor(world, a)) })) },
      appearance: node.appearance,
    });
    if (!owners.includes(selfOwner)) owners.push(selfOwner);
  };
  const walk = (children: readonly LayerChild[], world: Matrix) => {
    for (const child of children) {
      if (isLayer(child)) walk(child.children, world);
      else visit(child, multiply(world, child.transform), null);
    }
  };
  for (const layer of space.layers) walk(layer.children, [1, 0, 0, 1, 0, 0]);
  return { operands, owners };
}

const fillOf = (appearance: Appearance): AppearanceItem | undefined => appearance.items.find((i) => i.kind === 'fill');
const fillOnly = (appearance: Appearance): Appearance => ({ items: deepClone(appearance.items.filter((i) => i.kind === 'fill')) as AppearanceItem[] });

function outlineAppearance(appearance: Appearance): Appearance {
  const fill = fillOf(appearance);
  const paint: Paint = fill && fill.kind === 'fill' && fill.paint.type !== 'none' ? deepClone(fill.paint) : { type: 'solid', color: { model: 'gray', values: [100] } };
  return { items: [{ kind: 'stroke', paint, stroke: { ...defaultStroke(), width: OUTLINE_WIDTH }, opacity: 1, modifiers: [] }] };
}

/** Pieces → objects, contours moved into the coordinates of the container where they will live. */
export function nodesFromPieces(pieces: readonly BooleanPiece[], appearances: readonly Appearance[], toLocal: Matrix, ids: IdGenerator, look: 'full' | 'fill' | 'outline' = 'full'): Node[] {
  return pieces.map((piece) => {
    const paths = piece.subpaths.map((sp) => createPath(ids, sp.anchors.map((a) => mapAnchor(toLocal, a)), sp.closed));
    const base = appearances[piece.source] ?? appearances[0] ?? { items: [] };
    const appearance = look === 'full' ? (deepClone(base) as Appearance) : look === 'fill' ? fillOnly(base) : outlineAppearance(base);
    if (paths.length === 1) {
      const node = paths[0] as Node;
      node.appearance = appearance;
      return node;
    }
    const node = createCompound(ids, paths as never, piece.fillRule);
    node.appearance = appearance;
    for (const p of paths) p.appearance = { items: [] };
    return node;
  });
}

export interface PathfinderResult {
  command: Command;
  /** The objects that replace the selection. */
  resultIds: string[];
}

/** The inverse of the world matrix of the container that holds `id`. */
function containerInverse(space: Space, id: string): Matrix {
  const frame = frameOf(space, id);
  if (!frame) return [1, 0, 0, 1, 0, 0];
  const parentWorld = multiply(frame.world, invert(frame.node.transform) ?? [1, 0, 0, 1, 0, 0]);
  return invert(parentWorld) ?? [1, 0, 0, 1, 0, 0];
}

export function computePieces(op: PathfinderOp, operands: readonly Operand[]): ComputedPieces {
  const shapes = operands.map((o) => o.shape);
  switch (op) {
    case 'unite':
    case 'minusFront':
    case 'intersect':
    case 'exclude':
    case 'minusBack':
      return { pieces: shapeOperation(op, shapes), look: 'full', grouped: false };
    case 'divide':
      return { pieces: divideShapes(shapes), look: 'full', grouped: true };
    case 'trim':
      return { pieces: trimShapes(shapes, 'trim'), look: 'fill', grouped: true };
    case 'crop':
      return { pieces: trimShapes(shapes, 'crop'), look: 'fill', grouped: true };
    case 'merge':
      return {
        pieces: mergePieces(trimShapes(shapes, 'trim'), (p) => JSON.stringify((fillOf(operands[p.source]?.appearance ?? { items: [] }) as { paint?: unknown } | undefined)?.paint ?? null)),
        look: 'fill',
        grouped: true,
      };
    case 'outline':
      return { pieces: divideShapes(shapes), look: 'outline', grouped: true };
  }
}

/** How many objects with contours the selection holds (the operations need at least two). */
export const operandCount = (space: Space, ids: readonly string[]): number => gather(space, new Set(ids)).operands.length;

/**
 * Applies a pathfinder operation to the selected objects. Returns null when it cannot apply (fewer than two
 * objects with contours, or the geometry engine failed). The result replaces the topmost object in the z-order.
 */
export function pathfinder(space: Space, ids: readonly string[], op: PathfinderOp, newIds: IdGenerator): PathfinderResult | null {
  const plan = planPathfinder(space, ids, op);
  if (!plan) return null;
  let computed;
  try {
    computed = computePieces(op, plan.operands);
  } catch {
    return null;
  }
  return finishPathfinder(space, plan, computed, newIds);
}

/** From this many segments on, the interface should not wait for the geometry engine: it runs in a Worker. */
export const BOOLEAN_WORKER_SEGMENTS = 500;

/** What a pathfinder operation works on, gathered from the document (cheap) before the geometry is computed (expensive). */
export interface PathfinderPlan {
  op: PathfinderOp;
  operands: Operand[];
  owners: string[];
}

export interface ComputedPieces {
  pieces: BooleanPiece[];
  look: 'full' | 'fill' | 'outline';
  grouped: boolean;
}

/** The objects an operation would use, or null when it cannot apply (fewer than two objects with contours). */
export function planPathfinder(space: Space, ids: readonly string[], op: PathfinderOp): PathfinderPlan | null {
  const { operands, owners } = gather(space, new Set(ids));
  return operands.length < 2 || owners.length === 0 ? null : { op, operands, owners };
}

/** Total segments of the contours of a plan: what decides whether the work goes to a Worker. */
export const planSegments = (plan: PathfinderPlan): number => plan.operands.reduce((n, o) => n + o.shape.subpaths.reduce((m, sp) => m + sp.anchors.length, 0), 0);

/** Turns computed pieces into the reversible command (the document must still be the one the plan was made from). */
export function finishPathfinder(space: Space, plan: PathfinderPlan, computed: ComputedPieces, newIds: IdGenerator): PathfinderResult | null {
  const { operands, owners, op } = plan;
  const topOwner = owners[owners.length - 1] as string;
  const toLocal = containerInverse(space, topOwner);
  const appearances = operands.map((o) => o.appearance);
  let nodes = nodesFromPieces(computed.pieces, appearances, toLocal, newIds, computed.look);
  if (computed.grouped && nodes.length > 0) nodes = [createGroup(newIds, nodes as never)];
  const others = owners.filter((id) => id !== topOwner);
  const commands: Command[] = [replaceNode(space.id, topOwner, nodes)];
  if (others.length > 0) commands.push(removeNodes(space.id, others));
  return { command: combineCommands(`pathfinder.${op}`, commands), resultIds: nodes.map((n) => n.id) };
}

// ── Shape Builder ──

/** What the Shape Builder works on: the regions formed by the selected objects, and their looks. */
export interface Arrangement {
  faces: Face[];
  appearances: Appearance[];
  owners: string[];
  topOwner: string;
}

export function arrange(space: Space, ids: readonly string[]): Arrangement | null {
  const { operands, owners } = gather(space, new Set(ids));
  if (operands.length === 0) return null;
  try {
    return { faces: divideShapes(operands.map((o) => o.shape)), appearances: operands.map((o) => o.appearance), owners, topOwner: owners[owners.length - 1] as string };
  } catch {
    return null;
  }
}

/**
 * Applies a Shape Builder edit: `groups` are lists of face indices to unite into one object each, `removed` are
 * deleted, and every other region becomes its own object. All the selected objects are replaced by the regions.
 */
export function shapeBuilderEdit(space: Space, arrangement: Arrangement, groups: readonly number[][], removed: ReadonlySet<number>, newIds: IdGenerator): PathfinderResult | null {
  const { faces, appearances, owners, topOwner } = arrangement;
  const used = new Set<number>(removed);
  const pieces: BooleanPiece[] = [];
  const handled = new Set<number>();
  faces.forEach((face, i) => {
    if (used.has(i) || handled.has(i)) return;
    const group = groups.find((g) => g.includes(i));
    if (group && group.length > 1) {
      for (const j of group) handled.add(j);
      const members = group.filter((j) => !removed.has(j)).map((j) => faces[j] as Face);
      pieces.push(...unitePieces(members).map((p) => ({ ...p, source: (members[0] as Face).source })));
    } else {
      pieces.push(face);
    }
  });
  const toLocal = containerInverse(space, topOwner);
  const nodes = nodesFromPieces(pieces, appearances, toLocal, newIds, 'full');
  const others = owners.filter((id) => id !== topOwner);
  const commands: Command[] = [replaceNode(space.id, topOwner, nodes)];
  if (others.length > 0) commands.push(removeNodes(space.id, others));
  return { command: combineCommands('shapeBuilder', commands), resultIds: nodes.map((n) => n.id) };
}


const LIVE_IDS: Partial<Record<PathfinderOp, string>> = { unite: 'pf-unite', minusFront: 'pf-minus-front', intersect: 'pf-intersect', exclude: 'pf-exclude' };

/** Whether an operation exists as a live pathfinder (only the shape modes do, in v1). */
export const hasLiveVersion = (op: PathfinderOp): boolean => op in LIVE_IDS;

/**
 * Alt+click on a shape mode: the selection is grouped and the group gets the pathfinder as a modifier, so the
 * objects stay editable. The group is painted as one shape with the look of the topmost object.
 */
export function makeLivePathfinder(space: Space, ids: readonly string[], op: PathfinderOp, newIds: IdGenerator): PathfinderResult | null {
  const modifierId = LIVE_IDS[op];
  const { operands, owners } = gather(space, new Set(ids));
  if (!modifierId || operands.length < 2 || owners.length === 0) return null;
  const top = operands[operands.length - 1] as Operand;
  const group = createGroup(newIds, []);
  group.appearance = {
    items: [...(deepClone(top.appearance.items.filter((i) => i.kind !== 'modifier')) as AppearanceItem[]), { kind: 'modifier', mod: newModifier(newIds, modifierId, {}) }],
  };
  return { command: combineCommands(`pathfinder.live.${op}`, [groupNodes(space.id, owners, group)]), resultIds: [group.id] };
}

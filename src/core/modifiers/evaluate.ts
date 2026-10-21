import { shapeOperation, type BooleanShape } from '../geometry/booleans';
import { geometryBounds, nodeGeometry, setRenderOverride, type NodeGeometry } from '../geometry/geometry';
import { applyToPoint, multiply } from '../model/matrix';
import type { Matrix, ModifierInstance, Node } from '../model/types';
import { getModifier } from './registry';
import type { AppearanceEffect, Geometry, ModifierContext, Params } from './types';
import { mapGeometry } from './util';

// Evaluation of an object's modifier stack (specs/05): structural modifiers run first, in order, on the base
// contours (for a group with a live pathfinder, on the combined children); appearance modifiers describe effects.
// Cached per node: nodes are immutable, so a change of the node or of the stack makes a new key.

export interface Evaluated {
  geometry: Geometry;
  /** The geometry as the shape of the object (one shared instance, so caches can key on it). */
  shape: NodeGeometry;
  /** Set by Outline Stroke: strokes are painted as fills of this contour. */
  strokeOutline: Geometry | null;
  effects: AppearanceEffect[];
  /** True for a group drawn as one shape (live pathfinder) instead of through its children. */
  groupAsShape: boolean;
}

const cache = new WeakMap<Node, Evaluated | null>();

/** The enabled modifiers of the object itself (the ones of its fills and strokes are listed by the items). */
export function objectModifiers(node: Node): ModifierInstance[] {
  const out: ModifierInstance[] = [];
  for (const item of node.appearance.items) if (item.kind === 'modifier' && item.mod.enabled) out.push(item.mod);
  return out;
}

const paramsOf = (mod: ModifierInstance): Params => {
  const def = getModifier(mod.modifierId);
  const out: Params = { ...(def?.defaults ?? {}) };
  for (const [k, v] of Object.entries(mod.params)) if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[k] = v;
  return out;
};

/** Contours of the leaves under a group, in the group's own coordinates. */
function leafShapes(node: Node, matrix: Matrix, out: BooleanShape[]): void {
  if (node.type === 'group' || node.type === 'clipGroup') {
    for (const child of node.children) leafShapes(child, multiply(matrix, child.transform), out);
    return;
  }
  const g = nodeGeometry(node);
  if (!g || g.subpaths.length === 0) return;
  const mapped = mapGeometry({ subpaths: g.subpaths, fillRule: g.fillRule }, (p) => applyToPoint(matrix, p));
  out.push({ subpaths: mapped.subpaths.map((s) => ({ closed: true, anchors: s.anchors })), fillRule: g.fillRule });
}

function firstStroke(node: Node): ModifierContext['stroke'] {
  for (const item of node.appearance.items) {
    if (item.kind === 'stroke' && item.paint.type !== 'none' && item.opacity > 0) {
      return { width: item.stroke.width, cap: item.stroke.cap, join: item.stroke.join, miterLimit: item.stroke.miterLimit };
    }
  }
  return null;
}

/** The evaluated geometry and effects of an object, or null when it has no enabled modifier (use the base). */
export function evaluateNode(node: Node): Evaluated | null {
  if (cache.has(node)) return cache.get(node) ?? null;
  const result = compute(node);
  cache.set(node, result);
  return result;
}

function compute(node: Node): Evaluated | null {
  const mods = objectModifiers(node).filter((m) => getModifier(m.modifierId));
  if (mods.length === 0) return null;
  let geometry: Geometry | null = null;
  let groupAsShape = false;
  const isGroup = node.type === 'group' || node.type === 'clipGroup';
  const liveOp = isGroup ? mods.map((m) => getModifier(m.modifierId)?.groupOp).find((op) => op !== undefined) : undefined;
  if (isGroup && liveOp) {
    const shapes: BooleanShape[] = [];
    leafShapes(node, [1, 0, 0, 1, 0, 0], shapes);
    try {
      const pieces = shapes.length > 0 ? shapeOperation(liveOp, shapes) : [];
      geometry = { fillRule: 'evenodd', subpaths: pieces.flatMap((p) => p.subpaths) };
    } catch {
      geometry = { fillRule: 'nonzero', subpaths: [] };
    }
    groupAsShape = true;
  } else {
    const base = nodeGeometry(node);
    if (base) geometry = { fillRule: base.fillRule, subpaths: base.subpaths };
  }
  const effects: AppearanceEffect[] = [];
  let strokeOutline: Geometry | null = null;
  if (!geometry) return null;
  const stroke = firstStroke(node);
  for (const mod of mods) {
    const def = getModifier(mod.modifierId);
    if (!def) continue;
    if (def.groupOp) continue; // already consumed above
    const bounds = geometryBounds(geometry as NodeGeometry);
    const out = def.apply(geometry, paramsOf(mod), { bounds, stroke });
    if (out.geometry) geometry = out.geometry;
    if (out.strokeOutline) strokeOutline = out.strokeOutline;
    if (out.effect) effects.push(out.effect);
  }
  return { geometry, shape: { subpaths: geometry.subpaths, fillRule: geometry.fillRule }, strokeOutline, effects, groupAsShape };
}

/** Geometry to paint and hit-test: the evaluated one when the object has modifiers, else the base contours. */
export const evaluatedGeometry = (node: Node): NodeGeometry | null => evaluateNode(node)?.shape ?? nodeGeometry(node);

/** Room an object's shadows and glows need around its geometry. */
function effectMargin(node: Node): number {
  let m = 0;
  for (const e of evaluateNode(node)?.effects ?? []) m = Math.max(m, e.type === 'shadow' ? Math.hypot(e.dx, e.dy) + e.blur * 2 : e.blur * 2);
  return m;
}

setRenderOverride({
  geometry: (node) => evaluateNode(node)?.shape ?? null,
  groupAsShape: (node) => evaluateNode(node)?.groupAsShape === true,
  margin: effectMargin,
});

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

/** What one fill or stroke is painted with when it has modifiers of its own. */
export interface ItemEvaluated {
  geometry: Geometry;
  /** The geometry as a shape (one shared instance, so caches can key on it). */
  shape: NodeGeometry;
  /** Outline Stroke on this item: the stroke is painted as a fill of this contour. */
  strokeOutline: Geometry | null;
  /** Shadows and glows of this item alone. */
  effects: AppearanceEffect[];
}

export interface Evaluated {
  /** The contours of the object as a whole (its own modifiers applied). */
  geometry: Geometry;
  /** Same, as a shape: what the items without modifiers of their own are painted with. */
  paintShape: NodeGeometry;
  /** Everything the object covers (object and items together): what is picked and measured. */
  shape: NodeGeometry;
  /** Set by Outline Stroke on the whole object: strokes are painted as fills of this contour. */
  strokeOutline: Geometry | null;
  /** Shadows and glows of the object as a whole (fills and strokes together). */
  effects: AppearanceEffect[];
  /** Fills and strokes that have modifiers of their own, by position in the appearance list. */
  items: Map<number, ItemEvaluated>;
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

type StrokeContext = ModifierContext['stroke'];
const strokeContext = (stroke: { width: number; cap: 'butt' | 'round' | 'square'; join: 'miter' | 'round' | 'bevel'; miterLimit: number }): StrokeContext => ({ width: stroke.width, cap: stroke.cap, join: stroke.join, miterLimit: stroke.miterLimit });

function firstStroke(node: Node): StrokeContext {
  for (const item of node.appearance.items) if (item.kind === 'stroke' && item.paint.type !== 'none' && item.opacity > 0) return strokeContext(item.stroke);
  return null;
}

/** The enabled, known modifiers of a list. */
const enabled = (list: readonly ModifierInstance[]): ModifierInstance[] => list.filter((m) => m.enabled && getModifier(m.modifierId));

/** The enabled modifiers of one fill or stroke. */
export const itemModifiers = (item: { kind: string; modifiers?: ModifierInstance[] }): ModifierInstance[] => (item.kind === 'modifier' ? [] : enabled(item.modifiers ?? []));

interface Run {
  geometry: Geometry;
  strokeOutline: Geometry | null;
  effects: AppearanceEffect[];
}

/** Runs a list of modifiers over a geometry, in order (live pathfinders were already consumed by the caller). */
function run(start: Geometry, mods: readonly ModifierInstance[], stroke: StrokeContext): Run {
  let geometry = start;
  let strokeOutline: Geometry | null = null;
  const effects: AppearanceEffect[] = [];
  for (const mod of mods) {
    const def = getModifier(mod.modifierId);
    if (!def || def.groupOp) continue;
    const out = def.apply(geometry, paramsOf(mod), { bounds: geometryBounds(geometry as NodeGeometry), stroke });
    if (out.geometry) geometry = out.geometry;
    if (out.strokeOutline) strokeOutline = out.strokeOutline;
    if (out.effect) effects.push(out.effect);
  }
  return { geometry, strokeOutline, effects };
}

const asShape = (g: Geometry): NodeGeometry => ({ subpaths: g.subpaths, fillRule: g.fillRule });

/** The evaluated geometry and effects of an object, or null when it has no enabled modifier (use the base). */
export function evaluateNode(node: Node): Evaluated | null {
  if (cache.has(node)) return cache.get(node) ?? null;
  const result = compute(node);
  cache.set(node, result);
  return result;
}

function compute(node: Node): Evaluated | null {
  const mods = enabled(objectModifiers(node));
  const itemIndexes: number[] = [];
  node.appearance.items.forEach((item, i) => {
    if (itemModifiers(item).length > 0) itemIndexes.push(i);
  });
  if (mods.length === 0 && itemIndexes.length === 0) return null;

  let base: Geometry | null = null;
  let groupAsShape = false;
  const isGroup = node.type === 'group' || node.type === 'clipGroup';
  const liveOp = isGroup ? mods.map((m) => getModifier(m.modifierId)?.groupOp).find((op) => op !== undefined) : undefined;
  if (isGroup && liveOp) {
    const shapes: BooleanShape[] = [];
    leafShapes(node, [1, 0, 0, 1, 0, 0], shapes);
    try {
      const pieces = shapes.length > 0 ? shapeOperation(liveOp, shapes) : [];
      base = { fillRule: 'evenodd', subpaths: pieces.flatMap((p) => p.subpaths) };
    } catch {
      base = { fillRule: 'nonzero', subpaths: [] };
    }
    groupAsShape = true;
  } else {
    const g = nodeGeometry(node);
    if (g) base = { fillRule: g.fillRule, subpaths: g.subpaths };
  }
  if (!base) return null;

  const whole = run(base, mods, firstStroke(node));
  const items = new Map<number, ItemEvaluated>();
  for (const i of itemIndexes) {
    const item = node.appearance.items[i] as Extract<(typeof node.appearance.items)[number], { kind: 'fill' | 'stroke' }>;
    const stroke = item.kind === 'stroke' ? strokeContext(item.stroke) : firstStroke(node);
    // The modifiers of an item run first; those of the whole object then act on the result.
    const own = run(base, itemModifiers(item), stroke);
    const final = run(own.geometry, mods, stroke);
    items.set(i, { geometry: final.geometry, shape: asShape(final.geometry), strokeOutline: own.strokeOutline ?? final.strokeOutline, effects: own.effects });
  }
  const subpaths = [...whole.geometry.subpaths, ...[...items.values()].flatMap((it) => it.geometry.subpaths)];
  return {
    geometry: whole.geometry,
    paintShape: asShape(whole.geometry),
    shape: items.size === 0 ? asShape(whole.geometry) : { subpaths, fillRule: 'nonzero' },
    strokeOutline: whole.strokeOutline,
    effects: whole.effects,
    items,
    groupAsShape,
  };
}

/** Geometry to paint and hit-test: the evaluated one when the object has modifiers, else the base contours. */
export const evaluatedGeometry = (node: Node): NodeGeometry | null => evaluateNode(node)?.shape ?? nodeGeometry(node);

/** Room an object's shadows and glows need around its geometry. */
function effectMargin(node: Node): number {
  let m = 0;
  const e = evaluateNode(node);
  const all = [...(e?.effects ?? []), ...[...(e?.items.values() ?? [])].flatMap((it) => it.effects)];
  for (const fx of all) m = Math.max(m, fx.type === 'shadow' ? Math.hypot(fx.dx, fx.dy) + fx.blur * 2 : fx.blur * 2);
  return m;
}

setRenderOverride({
  geometry: (node) => evaluateNode(node)?.shape ?? null,
  groupAsShape: (node) => evaluateNode(node)?.groupAsShape === true,
  margin: effectMargin,
});

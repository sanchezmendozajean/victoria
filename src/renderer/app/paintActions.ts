import {
  applyGradient,
  defaultGradientFor,
  copyAppearance,
  defaultAppearance,
  defaultStroke,
  defaultGradientTransform,
  deepClone,
  geometryBounds,
  nodeGeometry,
  paintTargets,
  patchStroke,
  primaryItem,
  setItemOpacity,
  setNodeProps,
  setPaint,
  swapFillStroke,
  type Appearance,
  type BlendMode,
  type Color,
  type Matrix,
  type Node,
  type Paint,
  type StrokeStyle,
} from '../../core';
import { lookFromNode } from '../panels/look';
import { actionContext } from './selectionActions';
import { useUi } from './store';

type Target = 'fill' | 'stroke';

/** Last solid colour of each paint, so that "Color" after "Ninguno" brings it back (Illustrator does the same). */
const lastSolid: Record<Target, Color> = { fill: { model: 'rgb', values: [255, 255, 255] }, stroke: { model: 'rgb', values: [0, 0, 0] } };

let counter = 0;
/** A key that folds a drag on a slider into one undo step. Call once per gesture. */
export const nextPaintKey = (): string => `paint${++counter}`;

/** Nodes the colour controls act on right now. */
function selectedLeaves() {
  const c = actionContext();
  return c ? { c, nodes: paintTargets(c.space, c.ids) } : null;
}

/** Writes a paint into the template of the next objects. */
function updateNewLook(mutate: (look: Appearance) => void): void {
  const look = deepClone(useUi.getState().newLook) as Appearance;
  mutate(look);
  useUi.getState().setNewLook(look);
}

function ensureLookItem(look: Appearance, target: Target) {
  let item = primaryItem(look, target);
  if (!item) {
    look.items.push(
      target === 'fill'
        ? { kind: 'fill', paint: { type: 'none' }, opacity: 1, modifiers: [] }
        : { kind: 'stroke', paint: { type: 'none' }, stroke: defaultStroke(), opacity: 1, modifiers: [] },
    );
    item = primaryItem(look, target);
  }
  return item as NonNullable<typeof item>;
}

/**
 * Sets the fill or stroke of the selected objects and remembers it for the next ones. With nothing
 * selected only the "new object" look changes.
 */
export function applyPaint(target: Target, paint: Paint, key?: string): void {
  if (paint.type === 'solid') lastSolid[target] = paint.color;
  const s = selectedLeaves();
  if (s && s.nodes.length > 0) s.c.session.run(setPaint(s.c.space.id, s.c.ids, target, paint, key));
  updateNewLook((look) => {
    ensureLookItem(look, target).paint = paint;
  });
}

/** Stroke attributes (weight, caps…) for the selection and for the next objects. */
export function applyStroke(patch: Partial<StrokeStyle>, key?: string): void {
  const s = selectedLeaves();
  if (s && s.nodes.length > 0) s.c.session.run(patchStroke(s.c.space.id, s.c.ids, patch, key));
  updateNewLook((look) => {
    const item = ensureLookItem(look, 'stroke');
    if (item.kind !== 'stroke') return;
    for (const [k, v] of Object.entries(patch)) {
      const target = item.stroke as unknown as Record<string, unknown>;
      if (v === undefined) delete target[k];
      else target[k] = v;
    }
  });
}

export function applyItemOpacity(target: Target, opacity: number, key?: string): void {
  const s = selectedLeaves();
  if (s && s.nodes.length > 0) s.c.session.run(setItemOpacity(s.c.space.id, s.c.ids, target, opacity, key));
  updateNewLook((look) => {
    ensureLookItem(look, target).opacity = opacity;
  });
}

/** Object opacity and blend mode (of the selected objects: groups keep their own). */
export function applyObjectLook(props: { opacity?: number; blendMode?: BlendMode }, key?: string): void {
  const c = actionContext();
  if (c && c.ids.length > 0) c.session.run(setNodeProps(c.space.id, c.ids, props, key ? `object.look:${key}` : undefined));
}

/** Mayús+X. */
export function swapPaints(): void {
  const s = selectedLeaves();
  if (s && s.nodes.length > 0) s.c.session.run(swapFillStroke(s.c.space.id, s.c.ids));
  updateNewLook((look) => {
    const fill = ensureLookItem(look, 'fill');
    const stroke = ensureLookItem(look, 'stroke');
    const keep = fill.paint;
    fill.paint = stroke.paint;
    stroke.paint = keep;
  });
}

/** D: white fill, black 1 pt stroke. */
export function defaultPaints(): void {
  const fresh = defaultAppearance();
  const fill = primaryItem(fresh, 'fill');
  const stroke = primaryItem(fresh, 'stroke');
  if (fill) applyPaint('fill', fill.paint);
  if (stroke && stroke.kind === 'stroke') {
    applyPaint('stroke', stroke.paint);
    applyStroke({ width: stroke.stroke.width });
  }
}

/** "Color" button (`,`): a solid paint again, the last colour used for that paint. */
export function paintAsColor(target: Target): void {
  applyPaint(target, { type: 'solid', color: lastSolid[target] });
}

/** "Ninguno" button (`/`). */
export function paintAsNone(target: Target): void {
  applyPaint(target, { type: 'none' });
}

const localBounds = (node: Node) => {
  const g = nodeGeometry(node);
  return g ? geometryBounds(g) : null;
};

/** "Degradado" button (`.`): a linear gradient from the current colour to white (or black) over each object. */
export function paintAsGradient(target: Target): void {
  const s = selectedLeaves();
  if (!s || s.nodes.length === 0) return;
  const current = primaryItem({ items: s.nodes[0]?.appearance.items ?? [] }, target);
  const from = current?.paint.type === 'solid' ? current.paint.color : lastSolid[target];
  const gradient = defaultGradientFor(s.c.session.ids, 'linear', from);
  const transforms = new Map<string, Matrix>();
  for (const node of s.nodes) {
    const bounds = localBounds(node);
    if (bounds) transforms.set(node.id, defaultGradientTransform(bounds, 'linear', 0));
  }
  s.c.session.run(applyGradient(s.c.space.id, s.c.ids, target, { type: 'linear', gradient, transform: [1, 0, 0, 1, 0, 0] }, transforms));
}

/** The selection (or the new-object look) as an appearance template for the Eyedropper. */
export function currentLookTemplate(): Appearance {
  const s = selectedLeaves();
  const first = s?.nodes[0];
  return first ? lookFromNode(first) : (deepClone(useUi.getState().newLook) as Appearance);
}

export function pasteAppearance(ids: readonly string[], appearance: Appearance, extras: { opacity?: number; blendMode?: BlendMode } = {}): void {
  const c = actionContext();
  if (c && ids.length > 0) c.session.run(copyAppearance(c.space.id, ids, appearance, extras));
}

/**
 * Adopts the look of the selection as the look of the next objects (Illustrator: what you draw next
 * takes the attributes of the last object you selected).
 */
export function adoptSelectionLook(): void {
  const s = selectedLeaves();
  const first = s?.nodes[0];
  if (first) useUi.getState().setNewLook(lookFromNode(first));
}

import { sameColor } from './color';
import { childrenOf, locateNode } from './queries';
import { defaultStroke } from './factory';
import type { IdGenerator } from './ids';
import type { Appearance, AppearanceItem, Node, Paint, Space, StrokeStyle } from './types';

// Reading appearance across a selection for the panels: a value shared by every object is shown,
// anything else is "mixed" (the panel field stays empty).

export type Mixed<T> = { mixed: true } | { mixed: false; value: T };

/** The shared value of a list, or `{ mixed: true }`. An empty list has no value (null). */
export function commonValue<T>(values: readonly T[], equal: (a: T, b: T) => boolean = Object.is): Mixed<T> | null {
  const first = values[0];
  if (values.length === 0 || first === undefined) return null;
  return values.every((v) => equal(first, v)) ? { mixed: false, value: first } : { mixed: true };
}

/**
 * The objects whose own appearance a panel edits: a group stands for the objects inside it, as in
 * Illustrator (changing the fill of a group changes its children).
 */
export function paintTargets(space: Space, ids: readonly string[]): Node[] {
  const out: Node[] = [];
  const visit = (node: Node) => {
    const inner = childrenOf(node);
    if (inner) inner.forEach(visit);
    else out.push(node);
  };
  for (const id of ids) {
    const found = locateNode(space, id);
    if (found) visit(found.node);
  }
  return out;
}

export type PaintItem = Extract<AppearanceItem, { kind: 'fill' | 'stroke' }>;

/** The first fill or stroke of an appearance (the one the panels edit). */
export function primaryItem(appearance: Appearance, kind: 'fill' | 'stroke'): PaintItem | undefined {
  return appearance.items.find((i): i is PaintItem => i.kind === kind);
}

export const NO_PAINT: Paint = { type: 'none' };

export function samePaint(a: Paint, b: Paint): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'none':
      return true;
    case 'solid':
      return sameColor(a.color, (b as typeof a).color);
    case 'swatch':
      return a.swatchId === (b as typeof a).swatchId;
    default: {
      const other = b as typeof a;
      return a.gradientId === other.gradientId && a.transform.every((v, i) => Math.abs(v - other.transform[i]!) < 1e-9);
    }
  }
}

/** Fill or stroke paint of the nodes: shared, mixed, or null without nodes. A node without that item counts as "none". */
export function commonPaint(nodes: readonly Node[], kind: 'fill' | 'stroke'): Mixed<Paint> | null {
  return commonValue(
    nodes.map((n) => primaryItem(n.appearance, kind)?.paint ?? NO_PAINT),
    samePaint,
  );
}

/** One property of the strokes of the nodes that have a stroke; defaults when none has. */
export function commonStrokeField<K extends keyof StrokeStyle>(nodes: readonly Node[], key: K, equal: (a: StrokeStyle[K], b: StrokeStyle[K]) => boolean = Object.is): Mixed<StrokeStyle[K]> | null {
  if (nodes.length === 0) return null;
  const strokes = nodes.map((n) => primaryItem(n.appearance, 'stroke')).filter((i): i is Extract<PaintItem, { kind: 'stroke' }> => i?.kind === 'stroke');
  if (strokes.length === 0) return { mixed: false, value: defaultStroke()[key] };
  return commonValue(
    strokes.map((s) => s.stroke[key]),
    equal,
  );
}

export const sameNumbers = (a: readonly number[] | null | undefined, b: readonly number[] | null | undefined): boolean => {
  if (!a || !b) return !a && !b;
  return a.length === b.length && a.every((v, i) => v === b[i]);
};

/** Opacity of the fill or stroke items (0..1). */
export function commonItemOpacity(nodes: readonly Node[], kind: 'fill' | 'stroke'): Mixed<number> | null {
  const items = nodes.map((n) => primaryItem(n.appearance, kind)).filter((i): i is PaintItem => !!i);
  return commonValue(items.map((i) => i.opacity));
}

/** The first solid colour or swatch colour among the nodes' fills (what a plain click on a colour mode needs). */
export function firstSolid(paint: Paint): Extract<Paint, { type: 'solid' }>['color'] | null {
  return paint.type === 'solid' ? paint.color : null;
}

/** A deep copy of an appearance whose modifier instances get fresh ids (Eyedropper, new-object look). */
export function cloneAppearance(appearance: Appearance, ids: IdGenerator): Appearance {
  const copy = JSON.parse(JSON.stringify(appearance)) as Appearance;
  for (const item of copy.items) {
    const mods = item.kind === 'modifier' ? [item.mod] : item.modifiers;
    for (const mod of mods) mod.id = ids();
  }
  return copy;
}

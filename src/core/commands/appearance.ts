import type { Draft } from 'immer';
import { defaultAppearance, defaultStroke } from '../model/factory';
import { deepClone } from '../model/deepClone';
import { paintTargets } from '../model/appearance';
import { childrenOf, locateNode, locateNodes } from '../model/queries';
import type { Appearance, BlendMode, Document, Gradient, LayerChild, Matrix, Node, Paint, Space, StrokeStyle } from '../model/types';
import type { Command } from './command';

type DraftSpace = Draft<Space>;
type Target = 'fill' | 'stroke';

const findSpace = (d: Draft<Document>, id: string): DraftSpace | undefined => d.spaces.find((s) => s.id === id);

/** The draft nodes a panel edit reaches: groups stand for what is inside them. */
function targetsOf(space: DraftSpace, ids: readonly string[]): Draft<Node>[] {
  return paintTargets(space as Space, ids) as Draft<Node>[];
}

type DraftItem = Draft<Appearance>['items'][number];
type DraftPaintItem = Extract<DraftItem, { kind: 'fill' | 'stroke' }>;

function primary(appearance: Draft<Appearance>, kind: Target): DraftPaintItem | undefined {
  return appearance.items.find((i): i is DraftPaintItem => i.kind === kind);
}

/**
 * The fill or stroke item to edit, created when missing: a fill goes first (below the stroke), a
 * stroke last, with the paint `none` so that creating it never changes how the object looks.
 */
function ensureItem(appearance: Draft<Appearance>, kind: Target): DraftPaintItem {
  const existing = primary(appearance, kind);
  if (existing) return existing;
  const item =
    kind === 'fill'
      ? ({ kind: 'fill', paint: { type: 'none' }, opacity: 1, modifiers: [] } as DraftPaintItem)
      : ({ kind: 'stroke', paint: { type: 'none' }, stroke: defaultStroke(), opacity: 1, modifiers: [] } as DraftPaintItem);
  if (kind === 'fill') appearance.items.unshift(item as DraftItem);
  else appearance.items.push(item as DraftItem);
  return primary(appearance, kind) as DraftPaintItem;
}

/** The fill or stroke to edit: the first of a kind, or the item at a position of the appearance list. */
function pickItem(appearance: Draft<Appearance>, target: Target | number): DraftPaintItem | undefined {
  if (typeof target === 'number') {
    const item = appearance.items[target];
    return item && item.kind !== 'modifier' ? (item as DraftPaintItem) : undefined;
  }
  return primary(appearance, target);
}

const mergeKeyOf = (label: string, key?: string) => (key ? { mergeKey: `${label}:${key}` } : {});

/** Sets the fill or stroke paint of the selected objects (Relleno y color, Muestras, barra de herramientas). */
export const setPaint = (spaceId: string, ids: readonly string[], target: Target, paint: Paint, mergeKey?: string): Command => ({
  label: target === 'fill' ? 'appearance.fill' : 'appearance.stroke',
  spaceId,
  ...mergeKeyOf(target === 'fill' ? 'appearance.fill' : 'appearance.stroke', mergeKey),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const node of targetsOf(space, ids)) {
      if (paint.type === 'none' && !primary(node.appearance, target)) continue;
      ensureItem(node.appearance, target).paint = deepClone(paint) as Draft<Paint>;
    }
  },
});

/** Edits stroke attributes (weight, caps, dashes, arrows…) of the selected objects. */
export const patchStroke = (spaceId: string, ids: readonly string[], patch: Partial<StrokeStyle>, mergeKey?: string): Command => ({
  label: 'appearance.strokeStyle',
  spaceId,
  ...mergeKeyOf('appearance.strokeStyle', mergeKey),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const node of targetsOf(space, ids)) {
      const item = ensureItem(node.appearance, 'stroke');
      if (item.kind !== 'stroke') continue;
      for (const [key, value] of Object.entries(patch)) {
        const target = item.stroke as Record<string, unknown>;
        if (value === undefined) delete target[key];
        else target[key] = deepClone(value);
      }
    }
  },
});

export const setItemOpacity = (spaceId: string, ids: readonly string[], target: Target, opacity: number, mergeKey?: string): Command => ({
  label: 'appearance.opacity',
  spaceId,
  ...mergeKeyOf('appearance.opacity', mergeKey),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const node of targetsOf(space, ids)) {
      const item = primary(node.appearance, target);
      if (item) item.opacity = Math.min(1, Math.max(0, opacity));
    }
  },
});

/** Mayús+X: each object swaps its fill and stroke paints (the stroke attributes stay). */
export const swapFillStroke = (spaceId: string, ids: readonly string[]): Command => ({
  label: 'appearance.swap',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const node of targetsOf(space, ids)) {
      const fill = ensureItem(node.appearance, 'fill');
      const stroke = ensureItem(node.appearance, 'stroke');
      const keep = deepClone(fill.paint);
      fill.paint = deepClone(stroke.paint);
      stroke.paint = keep;
    }
  },
});

/** Cuentagotas: the objects take the given appearance (items already carry fresh modifier ids) and, optionally, opacity and blend mode. */
export const copyAppearance = (spaceId: string, ids: readonly string[], appearance: Appearance, extras: { opacity?: number; blendMode?: BlendMode } = {}): Command => ({
  label: 'appearance.copy',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const node of targetsOf(space, ids)) {
      node.appearance = deepClone(appearance) as Draft<Appearance>;
      if (extras.opacity !== undefined) node.opacity = extras.opacity;
      if (extras.blendMode !== undefined) node.blendMode = extras.blendMode;
    }
  },
});

/** Only the colour of one part (Mayús+clic del Cuentagotas): the fill or the stroke paint. */
export const copyPaint = (spaceId: string, ids: readonly string[], target: Target, paint: Paint): Command => setPaint(spaceId, ids, target, paint);

// ── Gradients ──────────────────────────────────────────────────────────────────────

/** Paints of the draft document that reference gradient `id`. */
function gradientPaintsOf(d: Draft<Document>, id: string): Draft<Paint>[] {
  const out: Draft<Paint>[] = [];
  const visitNode = (node: Draft<Node>) => {
    for (const item of node.appearance.items) {
      if (item.kind !== 'modifier' && (item.paint.type === 'linear' || item.paint.type === 'radial') && item.paint.gradientId === id) out.push(item.paint);
    }
    const inner = childrenOf(node as Node) as Draft<Node>[] | null;
    if (inner) inner.forEach(visitNode);
    if (node.type === 'compound') node.children.forEach(visitNode as (n: Draft<Node>) => void);
  };
  const visitChildren = (children: Draft<LayerChild>[]) => {
    for (const child of children) {
      if (child.type === 'layer') visitChildren(child.children);
      else visitNode(child as Draft<Node>);
    }
  };
  for (const space of d.spaces) visitChildren(space.layers as Draft<LayerChild>[]);
  return out;
}

export interface GradientPaintInit {
  type: 'linear' | 'radial';
  gradient: Gradient;
  transform: Matrix;
}

/**
 * Gives the selected objects a gradient fill or stroke. The gradient resource is added to the document
 * (one per call: objects that receive it together share it).
 */
export const applyGradient = (spaceId: string, ids: readonly string[], target: Target | number, init: GradientPaintInit, transforms?: ReadonlyMap<string, Matrix>, mergeKey?: string): Command => ({
  label: target === 'fill' ? 'appearance.fill' : 'appearance.stroke',
  spaceId,
  ...mergeKeyOf('appearance.gradient', mergeKey),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    if (!d.resources.gradients.some((g) => g.id === init.gradient.id)) d.resources.gradients.push(deepClone(init.gradient) as Draft<Gradient>);
    for (const node of (typeof target === 'number' ? ownTargets : targetsOf)(space, ids)) {
      const item = (typeof target === 'number' ? pickItem(node.appearance, target) : undefined) ?? ensureItem(node.appearance, typeof target === 'number' ? 'fill' : target);
      item.paint = { type: init.type, gradientId: init.gradient.id, transform: [...(transforms?.get(node.id) ?? init.transform)] as Matrix } as Draft<Paint>;
    }
  },
});

/** Replaces the transform (direction, length, aspect) of the selected objects' gradient paints. */
export const setGradientTransform = (spaceId: string, ids: readonly string[], target: Target | number, transforms: ReadonlyMap<string, Matrix>, type?: 'linear' | 'radial', mergeKey?: string): Command => ({
  label: 'appearance.gradient',
  spaceId,
  ...mergeKeyOf('appearance.gradient', mergeKey),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const node of (typeof target === 'number' ? ownTargets : targetsOf)(space, ids)) {
      const item = pickItem(node.appearance, target);
      const transform = transforms.get(node.id);
      if (!item || !transform || (item.paint.type !== 'linear' && item.paint.type !== 'radial')) continue;
      item.paint.transform = [...transform] as Matrix as Draft<Matrix>;
      if (type) item.paint.type = type;
    }
  },
});

/**
 * Edits the gradient the selected objects use. A gradient shared with objects outside the edit is
 * copied first (so duplicating an object never links their gradients).
 */
export const editGradients = (spaceId: string, ids: readonly string[], target: Target | number, mutate: (gradient: Draft<Gradient>) => void, newId: () => string, mergeKey?: string): Command => ({
  label: 'appearance.gradient',
  spaceId,
  ...mergeKeyOf('appearance.gradient', mergeKey),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    const mine = new Map<string, Draft<Paint>[]>();
    for (const node of (typeof target === 'number' ? ownTargets : targetsOf)(space, ids)) {
      const item = pickItem(node.appearance, target);
      if (item && (item.paint.type === 'linear' || item.paint.type === 'radial')) {
        const list = mine.get(item.paint.gradientId) ?? [];
        list.push(item.paint);
        mine.set(item.paint.gradientId, list);
      }
    }
    for (const [id, paints] of mine) {
      const resource = d.resources.gradients.find((g) => g.id === id);
      if (!resource) continue;
      const shared = gradientPaintsOf(d, id).length > paints.length;
      let editing = resource;
      if (shared) {
        const copy = deepClone(resource) as Gradient;
        copy.id = newId();
        d.resources.gradients.push(copy as Draft<Gradient>);
        for (const paint of paints) if (paint.type === 'linear' || paint.type === 'radial') paint.gradientId = copy.id;
        editing = d.resources.gradients[d.resources.gradients.length - 1] as Draft<Gradient>;
      }
      mutate(editing);
      for (const paint of paints) {
        if (paint.type === 'linear' || paint.type === 'radial') paint.type = editing.type;
      }
    }
  },
});

export const removeUnusedGradients = (): Command => ({
  label: 'resource.gradient.prune',
  apply: (d) => {
    const used = new Set<string>();
    const visit = (children: Draft<LayerChild>[]) => {
      for (const child of children) {
        if (child.type === 'layer') {
          visit(child.children);
          continue;
        }
        const walk = (node: Draft<Node>) => {
          for (const item of node.appearance.items) if (item.kind !== 'modifier' && (item.paint.type === 'linear' || item.paint.type === 'radial')) used.add(item.paint.gradientId);
          const inner = childrenOf(node as Node) as Draft<Node>[] | null;
          if (inner) inner.forEach(walk);
        };
        walk(child as Draft<Node>);
      }
    };
    for (const space of d.spaces) visit(space.layers as Draft<LayerChild>[]);
    d.resources.gradients = d.resources.gradients.filter((g) => used.has(g.id));
  },
});

// Kept for callers that only need to know whether a node exists in a Space.
export const hasNode = (space: Space, id: string): boolean => locateNode(space, id) !== null;

/** "Escalar trazos y efectos": multiplies the weight (and dash lengths) of the strokes of the objects by `factor`. */
export const scaleStrokeWidths = (spaceId: string, ids: readonly string[], factor: number, mergeKey?: string): Command => ({
  label: 'appearance.strokeStyle',
  spaceId,
  ...mergeKeyOf('appearance.strokeStyle', mergeKey),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const node of targetsOf(space, ids)) {
      for (const item of node.appearance.items) {
        if (item.kind !== 'stroke') continue;
        item.stroke.width *= factor;
        if (item.stroke.dash) item.stroke.dash = item.stroke.dash.map((v) => v * factor);
      }
    }
  },
});

// ── Appearance list (panel Apariencia) ──

/** The objects an Apariencia edit reaches: the selected objects themselves (a group has a fill and stroke of its own). */
const ownTargets = (space: DraftSpace, ids: readonly string[]): Draft<Node>[] => locateNodes(space as Space, ids).map((l) => l.node as Draft<Node>);

/** Where the content of a group sits among its items (how many are painted behind it). */
const contentAt = (appearance: Draft<Appearance>): number => Math.max(0, Math.min(appearance.items.length, appearance.contentIndex ?? appearance.items.length));

/**
 * Adds a fill (white) or a stroke (1 pt black) to each selected object: on top of an object's appearance, and
 * right behind the content ("Contenido") for a group.
 */
export const addPaintItem = (spaceId: string, ids: readonly string[], kind: Target, paint: Paint): Command => ({
  label: 'appearance.add',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const node of ownTargets(space, ids)) {
      const item = (kind === 'fill' ? { kind: 'fill', paint, opacity: 1, modifiers: [] } : { kind: 'stroke', paint, stroke: defaultStroke(), opacity: 1, modifiers: [] }) as DraftItem;
      if (node.type === 'group') {
        const at = contentAt(node.appearance);
        node.appearance.items.splice(at, 0, item);
        node.appearance.contentIndex = at + 1;
      } else node.appearance.items.push(item);
    }
  },
});

/** Removes the item at a position of the appearance list (fill, stroke or modifier). */
export const removeAppearanceItem = (spaceId: string, id: string, index: number): Command => ({
  label: 'appearance.remove',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateNode(space as Space, id) : null;
    if (!found) return;
    const node = found.node as Draft<Node>;
    if (node.type === 'group') node.appearance.contentIndex = contentAt(node.appearance) - (index < contentAt(node.appearance) ? 1 : 0);
    node.appearance.items.splice(index, 1);
  },
});

/**
 * Moves an item of the appearance list (paint order, order of modifiers). In a group the "Contenido" row takes part
 * in the order: `from` and `to` can be `'content'`.
 */
export const moveAppearanceItem = (spaceId: string, id: string, from: number | 'content', to: number | 'content'): Command => ({
  label: 'appearance.move',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateNode(space as Space, id) : null;
    if (!found) return;
    const node = found.node as Draft<Node>;
    const items = node.appearance.items;
    if (node.type !== 'group') {
      if (typeof from !== 'number' || typeof to !== 'number') return;
      const [item] = items.splice(from, 1);
      if (item) items.splice(Math.max(0, Math.min(items.length, to)), 0, item);
      return;
    }
    // The list with a marker where the content sits, so everything moves as the panel shows it.
    const content = contentAt(node.appearance);
    const list: (DraftItem | 'content')[] = [...items.slice(0, content), 'content', ...items.slice(content)];
    const position = (at: number | 'content') => (at === 'content' ? content : at < content ? at : at + 1);
    const [moved] = list.splice(position(from), 1);
    if (moved === undefined) return;
    list.splice(Math.max(0, Math.min(list.length, position(to))), 0, moved);
    node.appearance.items = list.filter((x): x is DraftItem => x !== 'content');
    node.appearance.contentIndex = list.indexOf('content');
  },
});

/** The "Limpiar apariencia" button: an object goes back to a plain look; a group loses its own fills, strokes and modifiers. */
export const clearOwnAppearance = (spaceId: string, ids: readonly string[]): Command => ({
  label: 'appearance.copy',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const node of ownTargets(space, ids)) node.appearance = (node.type === 'group' ? { items: [] } : deepClone(defaultAppearance())) as Draft<Appearance>;
  },
});

/** Duplicates the item at a position (a fill or stroke; modifiers have their own command). */
export const duplicateAppearanceItem = (spaceId: string, id: string, index: number): Command => ({
  label: 'appearance.duplicate',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateNode(space as Space, id) : null;
    const items = found ? (found.node as Draft<Node>).appearance.items : null;
    const item = items?.[index];
    if (!found || !items || !item || item.kind === 'modifier') return;
    const node = found.node as Draft<Node>;
    // The copy goes right above the original: the content marker moves up with it when the original is behind it.
    if (node.type === 'group' && index < contentAt(node.appearance)) node.appearance.contentIndex = contentAt(node.appearance) + 1;
    items.splice(index + 1, 0, deepClone(item) as DraftItem);
  },
});

/** Edits one fill or stroke of an object by its position in the list (panel Apariencia): its paint and/or stroke weight. */
export const setPaintItem = (spaceId: string, id: string, index: number, patch: { paint?: Paint; width?: number; visible?: boolean }, mergeKey?: string): Command => ({
  label: 'appearance.item',
  spaceId,
  ...mergeKeyOf('appearance.item', mergeKey ? `${id}:${index}:${mergeKey}` : undefined),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateNode(space as Space, id) : null;
    const item = found ? (found.node as Draft<Node>).appearance.items[index] : null;
    if (!item || item.kind === 'modifier') return;
    if (patch.paint) item.paint = deepClone(patch.paint) as Draft<Paint>;
    if (patch.width !== undefined && item.kind === 'stroke') item.stroke.width = Math.max(0, patch.width);
    if (patch.visible !== undefined) item.visible = patch.visible;
  },
});

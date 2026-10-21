import type { Draft } from 'immer';
import { deepClone } from '../model/deepClone';
import { createCompound, createGroup, createPath } from '../model/factory';
import type { IdGenerator } from '../model/ids';
import { multiply, translation } from '../model/matrix';
import { locateNode } from '../model/queries';
import type { Appearance, AppearanceItem, Document, JsonValue, ModifierInstance, Node, PathNode, Space } from '../model/types';
import { evaluateNode } from '../modifiers/evaluate';
import type { Geometry, Params } from '../modifiers/types';
import { combineCommands, type Command } from './command';
import { replaceNodes } from './node';

// Commands over the modifier stack of objects (specs/05): add, edit, switch off, reorder, duplicate, remove,
// and "apply" (expand), which makes the result of the modifiers permanent geometry.

type DraftSpace = Draft<Space>;
const findSpace = (d: Draft<Document>, id: string): DraftSpace | undefined => d.spaces.find((sp) => sp.id === id);

/**
 * Where a modifier acts: on the whole object (its entries in the appearance list) or on one fill or stroke
 * (the `modifiers` of that item, by its position in the list).
 */
export type ModifierTarget = { zone: 'object' } | { zone: 'item'; index: number };

type DraftNode = Draft<Node>;
type DraftMods = Draft<ModifierInstance>[];

/** The modifier list of a zone as plain operations, so that the object-level entries behave like an array. */
function zoneOf(node: DraftNode, target: ModifierTarget) {
  if (target.zone === 'item') {
    const item = node.appearance.items[target.index];
    const list: DraftMods | null = item && item.kind !== 'modifier' ? (item.modifiers as DraftMods) : null;
    return {
      list: (): DraftMods => list ?? [],
      insert(mod: Draft<ModifierInstance>, position?: number) {
        if (list) list.splice(position ?? list.length, 0, mod);
      },
    };
  }
  const items = node.appearance.items;
  return {
    list: (): DraftMods => items.flatMap((i) => (i.kind === 'modifier' ? [i.mod] : [])) as DraftMods,
    insert(mod: Draft<ModifierInstance>, position?: number) {
      const slots = items.flatMap((i, at) => (i.kind === 'modifier' ? [at] : []));
      const at = position === undefined || position >= slots.length ? items.length : (slots[position] as number);
      items.splice(at, 0, { kind: 'modifier', mod } as Draft<AppearanceItem>);
    },
  };
}

/** Finds a modifier wherever it lives in the object and returns how to take it out. */
function locateModifier(node: DraftNode, modId: string): { target: ModifierTarget; mod: Draft<ModifierInstance>; position: number; remove(): void } | null {
  const items = node.appearance.items;
  const objectMods = items.flatMap((i, at) => (i.kind === 'modifier' ? [{ mod: i.mod, at }] : []));
  const own = objectMods.findIndex((m) => m.mod.id === modId);
  if (own !== -1) {
    const entry = objectMods[own] as (typeof objectMods)[number];
    return { target: { zone: 'object' }, mod: entry.mod, position: own, remove: () => void items.splice(entry.at, 1) };
  }
  for (let index = 0; index < items.length; index++) {
    const item = items[index] as DraftNode['appearance']['items'][number];
    if (item.kind === 'modifier') continue;
    const position = (item.modifiers as DraftMods).findIndex((m) => m.id === modId);
    if (position !== -1) return { target: { zone: 'item', index }, mod: item.modifiers[position] as Draft<ModifierInstance>, position, remove: () => void item.modifiers.splice(position, 1) };
  }
  return null;
}

const nodeIn = (d: Draft<Document>, spaceId: string, nodeId: string): DraftNode | null => {
  const space = findSpace(d, spaceId);
  const found = space ? locateNode(space as Space, nodeId) : null;
  return found ? (found.node as DraftNode) : null;
};

export const newModifier = (ids: IdGenerator, modifierId: string, params: Params): ModifierInstance => ({ id: ids(), modifierId, enabled: true, params: { ...params } as { [key: string]: JsonValue } });

/** Adds a modifier to each object (a fresh instance per object, built by the caller so that ids stay unique). */
export const addModifier = (spaceId: string, additions: ReadonlyArray<{ nodeId: string; mod: ModifierInstance; target?: ModifierTarget }>, mergeKey?: string): Command => ({
  label: 'modifier.add',
  spaceId,
  ...(mergeKey ? { mergeKey } : {}),
  apply: (d) => {
    for (const { nodeId, mod, target } of additions) {
      const node = nodeIn(d, spaceId, nodeId);
      if (node) zoneOf(node, target ?? { zone: 'object' }).insert(deepClone(mod) as Draft<ModifierInstance>);
    }
  },
});

/** Changes the parameters and/or the on-off state of a modifier. The key (used verbatim) merges a dialog's edits into one step. */
export const updateModifier = (spaceId: string, nodeId: string, modId: string, patch: { params?: Params; enabled?: boolean }, mergeKey?: string): Command => ({
  label: 'modifier.edit',
  spaceId,
  ...(mergeKey ? { mergeKey } : {}),
  apply: (d) => {
    const node = nodeIn(d, spaceId, nodeId);
    const found = node ? locateModifier(node, modId) : null;
    if (!found) return;
    if (patch.params) found.mod.params = { ...found.mod.params, ...(patch.params as { [key: string]: JsonValue }) };
    if (patch.enabled !== undefined) found.mod.enabled = patch.enabled;
  },
});

export const removeModifier = (spaceId: string, nodeId: string, modId: string): Command => ({
  label: 'modifier.remove',
  spaceId,
  apply: (d) => {
    const node = nodeIn(d, spaceId, nodeId);
    locateModifier(node as DraftNode, modId)?.remove();
  },
});

/**
 * Moves a modifier to a position of a zone: before the `position`-th modifier of the target (at the end when
 * omitted). The same call reorders within a zone and moves between the whole object and one of its fills or strokes.
 */
export const moveModifier = (spaceId: string, nodeId: string, modId: string, target: ModifierTarget, position?: number): Command => ({
  label: 'modifier.move',
  spaceId,
  apply: (d) => {
    const node = nodeIn(d, spaceId, nodeId);
    const found = node ? locateModifier(node, modId) : null;
    if (!node || !found) return;
    const mod = deepClone(found.mod) as Draft<ModifierInstance>;
    found.remove();
    // Taking it out shifts the positions of the modifiers after it in the same zone.
    const sameZone = JSON.stringify(found.target) === JSON.stringify(target);
    const at = position !== undefined && sameZone && position > found.position ? position - 1 : position;
    zoneOf(node, target).insert(mod, at);
  },
});

/** Duplicates a modifier right after the original, in the same zone. */
export const duplicateModifier = (spaceId: string, nodeId: string, modId: string, newId: string): Command => ({
  label: 'modifier.duplicate',
  spaceId,
  apply: (d) => {
    const node = nodeIn(d, spaceId, nodeId);
    const found = node ? locateModifier(node, modId) : null;
    if (!node || !found) return;
    zoneOf(node, found.target).insert({ ...(deepClone(found.mod) as Draft<ModifierInstance>), id: newId }, found.position + 1);
  },
});

// ── Apply (expand) ──

function nodeFromGeometry(ids: IdGenerator, geometry: Geometry, like: Node, appearance: Appearance, transform = like.transform): Node | null {
  const paths: PathNode[] = geometry.subpaths.filter((s) => s.anchors.length > 1).map((s) => createPath(ids, deepClone(s.anchors), s.closed));
  if (paths.length === 0) return null;
  let node: Node;
  if (paths.length === 1) {
    node = paths[0] as PathNode;
  } else {
    node = createCompound(ids, paths, geometry.fillRule);
    for (const p of paths) p.appearance = { items: [] };
  }
  node.appearance = appearance;
  node.transform = [...transform] as Node['transform'];
  node.opacity = like.opacity;
  node.blendMode = like.blendMode;
  if (like.name) node.name = like.name;
  return node;
}

const withoutModifiers = (appearance: Appearance): AppearanceItem[] =>
  appearance.items.flatMap((i): AppearanceItem[] => (i.kind === 'modifier' ? [] : [{ ...(deepClone(i) as typeof i), modifiers: [] }]));

/** Replaces an object whose fills or strokes have their own modifiers by one object per fill or stroke, grouped. */
function expandItems(node: Node, e: NonNullable<ReturnType<typeof evaluateNode>>, ids: IdGenerator): Node[] {
  const parts: Node[] = [];
  const shadowOf = (geometry: Geometry, fx: (typeof e.effects)[number]) => {
    if (fx.type !== 'shadow') return;
    const shadow = nodeFromGeometry(ids, geometry, node, { items: [{ kind: 'fill', paint: { type: 'solid', color: fx.color }, opacity: fx.opacity, modifiers: [] }] }, translation(fx.dx, fx.dy));
    if (shadow) parts.push(shadow);
  };
  for (const fx of e.effects) shadowOf(e.geometry, fx);
  node.appearance.items.forEach((item, index) => {
    if (item.kind === 'modifier') return;
    const own = e.items.get(index);
    for (const fx of own?.effects ?? []) shadowOf(own?.geometry ?? e.geometry, fx);
    const plain = { ...(deepClone(item) as typeof item), modifiers: [] };
    let geometry = own?.geometry ?? e.geometry;
    let look: AppearanceItem = plain;
    if (own?.strokeOutline && item.kind === 'stroke') {
      // Outline Stroke on this stroke: it is now a filled contour painted with the stroke's paint.
      geometry = own.strokeOutline;
      look = { kind: 'fill', paint: item.paint, opacity: item.opacity, modifiers: [] };
    }
    const part = nodeFromGeometry(ids, geometry, node, { items: [look] }, [1, 0, 0, 1, 0, 0]);
    if (part) parts.push(part);
  });
  if (parts.length === 0) return [];
  const group = createGroup(ids, parts as never);
  if (node.name) group.name = node.name;
  group.opacity = node.opacity;
  group.blendMode = node.blendMode;
  group.transform = [...node.transform] as Node['transform'];
  return [group];
}

/** The objects that replace `node` once its modifiers are made permanent (null when it has none to apply). */
function expandNode(node: Node, ids: IdGenerator): Node[] | null {
  if ((node.type === 'group' || node.type === 'clipGroup') && evaluateNode(node)?.groupAsShape !== true) {
    let changed = false;
    const children = node.children.flatMap((child, index) => {
      if (node.type === 'clipGroup' && index === 0) return [child]; // the mask stays as it is
      const expanded = expandNode(child, ids);
      if (!expanded) return [child];
      changed = true;
      return expanded;
    });
    return changed ? [{ ...deepClone(node), children } as Node] : null;
  }
  const e = evaluateNode(node);
  if (!e) return null;
  // Fills and strokes with modifiers of their own become separate objects (one per item, in paint order).
  if (e.items.size > 0) return expandItems(node, e, ids);

  const items = withoutModifiers(node.appearance);
  const out: Node[] = [];

  for (const effect of e.effects) {
    if (effect.type !== 'shadow') continue;
    // A shadow becomes its own object under the shape (the blur is lost: there is no blur in vector geometry).
    const shadow = nodeFromGeometry(
      ids,
      e.geometry,
      node,
      { items: [{ kind: 'fill', paint: { type: 'solid', color: effect.color }, opacity: effect.opacity, modifiers: [] }] },
      multiply(translation(effect.dx, effect.dy), node.transform),
    );
    if (shadow) out.push(shadow);
  }

  if (e.strokeOutline) {
    const stroke = items.find((i) => i.kind === 'stroke' && i.paint.type !== 'none');
    const rest = items.filter((i) => i.kind !== 'stroke');
    const body = nodeFromGeometry(ids, e.geometry, node, { items: rest });
    const outline = nodeFromGeometry(ids, e.strokeOutline, node, {
      items: stroke && stroke.kind === 'stroke' ? [{ kind: 'fill', paint: stroke.paint, opacity: stroke.opacity, modifiers: [] }] : [],
    });
    const parts = [body, outline].filter((n): n is Node => n !== null);
    if (parts.length === 1) out.push(parts[0] as Node);
    else if (parts.length > 1) {
      const group = createGroup(ids, parts as never);
      if (node.name) group.name = node.name;
      group.opacity = node.opacity;
      group.blendMode = node.blendMode;
      // The group carries the object's own transform once; its parts sit in it untransformed.
      group.transform = [...node.transform] as Node['transform'];
      for (const p of parts) {
        p.transform = [1, 0, 0, 1, 0, 0];
        p.opacity = 1;
        p.blendMode = 'normal';
      }
      out.push(group);
    }
    return out;
  }

  const main = nodeFromGeometry(ids, e.geometry, node, { items });
  if (main) out.push(main);
  return out;
}

export interface ExpandResult {
  command: Command;
  resultIds: string[];
}

/** Object › Aplicar modificadores: makes the result of the modifiers of the selected objects permanent. */
export function expandModifiers(space: Space, selected: readonly string[], ids: IdGenerator): ExpandResult | null {
  const replacements: Array<{ id: string; nodes: Node[] }> = [];
  const resultIds: string[] = [];
  for (const id of selected) {
    const found = locateNode(space, id);
    if (!found) continue;
    const nodes = expandNode(found.node, ids);
    if (!nodes) {
      resultIds.push(id);
      continue;
    }
    replacements.push({ id, nodes });
    resultIds.push(...nodes.map((n) => n.id));
  }
  if (replacements.length === 0) return null;
  return { command: combineCommands('modifier.apply', [replaceNodes(space.id, replacements, 'modifier.apply')]), resultIds };
}

/** True when the object, or anything inside it, has a modifier that is switched on. */
export function hasModifiers(node: Node): boolean {
  if (node.appearance.items.some((i) => i.kind === 'modifier' || i.modifiers.length > 0)) return true;
  return (node.type === 'group' || node.type === 'clipGroup') && node.children.some(hasModifiers);
}


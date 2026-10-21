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
const findSpace = (d: Draft<Document>, id: string): DraftSpace | undefined => d.spaces.find((s) => s.id === id);

/** The entry of the appearance list that holds a modifier of the object itself. */
function entryOf(node: Draft<Node>, modId: string) {
  return node.appearance.items.findIndex((i) => i.kind === 'modifier' && i.mod.id === modId);
}

export const newModifier = (ids: IdGenerator, modifierId: string, params: Params): ModifierInstance => ({ id: ids(), modifierId, enabled: true, params: { ...params } as { [key: string]: JsonValue } });

/** Adds a modifier to each object (a fresh instance per object, built by the caller so that ids stay unique). */
export const addModifier = (spaceId: string, additions: ReadonlyArray<{ nodeId: string; mod: ModifierInstance }>, label = 'modifier.add'): Command => ({
  label,
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    for (const { nodeId, mod } of additions) {
      const found = locateNode(space as Space, nodeId);
      if (found) (found.node as Draft<Node>).appearance.items.push({ kind: 'modifier', mod: deepClone(mod) } as Draft<AppearanceItem>);
    }
  },
});

/** Changes the parameters and/or the on-off state of a modifier. A key merges a drag of a slider into one step. */
export const updateModifier = (spaceId: string, nodeId: string, modId: string, patch: { params?: Params; enabled?: boolean }, mergeKey?: string): Command => ({
  label: 'modifier.edit',
  spaceId,
  ...(mergeKey ? { mergeKey: `modifier.edit:${nodeId}:${modId}:${mergeKey}` } : {}),
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateNode(space as Space, nodeId) : null;
    if (!found) return;
    const node = found.node as Draft<Node>;
    const at = entryOf(node, modId);
    const item = node.appearance.items[at];
    if (!item || item.kind !== 'modifier') return;
    if (patch.params) item.mod.params = { ...item.mod.params, ...(patch.params as { [key: string]: JsonValue }) };
    if (patch.enabled !== undefined) item.mod.enabled = patch.enabled;
  },
});

export const removeModifier = (spaceId: string, nodeId: string, modId: string): Command => ({
  label: 'modifier.remove',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateNode(space as Space, nodeId) : null;
    if (!found) return;
    const node = found.node as Draft<Node>;
    const at = entryOf(node, modId);
    if (at !== -1) node.appearance.items.splice(at, 1);
  },
});

/** Moves a modifier to another position of the appearance list (the order of modifiers is the order they run in). */
export const moveModifier = (spaceId: string, nodeId: string, modId: string, toIndex: number): Command => ({
  label: 'modifier.move',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateNode(space as Space, nodeId) : null;
    if (!found) return;
    const items = (found.node as Draft<Node>).appearance.items;
    const at = entryOf(found.node as Draft<Node>, modId);
    if (at === -1) return;
    const [item] = items.splice(at, 1);
    if (item) items.splice(Math.max(0, Math.min(items.length, toIndex)), 0, item);
  },
});

export const duplicateModifier = (spaceId: string, nodeId: string, modId: string, newId: string): Command => ({
  label: 'modifier.duplicate',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateNode(space as Space, nodeId) : null;
    if (!found) return;
    const node = found.node as Draft<Node>;
    const at = entryOf(node, modId);
    const item = node.appearance.items[at];
    if (item && item.kind === 'modifier') node.appearance.items.splice(at + 1, 0, { kind: 'modifier', mod: { ...deepClone(item.mod), id: newId } } as Draft<AppearanceItem>);
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
  if (node.appearance.items.some((i) => i.kind === 'modifier')) return true;
  return (node.type === 'group' || node.type === 'clipGroup') && node.children.some(hasModifiers);
}


import { isLayer, locateLayer, locateNode, type Layer, type LayerChild, type Node, type Space } from '../../core';

/** One visible row of the Layers panel tree. */
export interface LayerRow {
  id: string;
  kind: 'layer' | 'node';
  depth: number;
  layer?: Layer;
  node?: Node;
  /** Layer (or sublayer) that holds the row; for a layer row, its parent layer or null at the top level. */
  parentLayerId: string | null;
  /** The node is inside a group (so it cannot be a drop target for reordering between layers). */
  inGroup: boolean;
  expandable: boolean;
  expanded: boolean;
}

/**
 * Rows of the tree in the order Illustrator shows them: top of the stack first (the last child of each
 * container is drawn on top). Layers are open unless collapsed; groups are closed unless expanded.
 */
export function buildRows(space: Space, collapsed: ReadonlySet<string>, expanded: ReadonlySet<string>): LayerRow[] {
  const rows: LayerRow[] = [];
  const visitNode = (node: Node, depth: number, layerId: string, inGroup: boolean) => {
    const kids = node.type === 'group' || node.type === 'clipGroup' ? node.children : null;
    const open = !!kids && expanded.has(node.id);
    rows.push({ id: node.id, kind: 'node', depth, node, parentLayerId: layerId, inGroup, expandable: !!kids && kids.length > 0, expanded: open });
    if (kids && open) for (let i = kids.length - 1; i >= 0; i--) visitNode(kids[i] as Node, depth + 1, layerId, true);
  };
  const visitLayer = (layer: Layer, depth: number, parent: string | null) => {
    const open = !collapsed.has(layer.id);
    rows.push({ id: layer.id, kind: 'layer', depth, layer, parentLayerId: parent, inGroup: false, expandable: layer.children.length > 0, expanded: open });
    if (!open) return;
    for (let i = layer.children.length - 1; i >= 0; i--) {
      const child = layer.children[i] as LayerChild;
      if (isLayer(child)) visitLayer(child, depth + 1, layer.id);
      else visitNode(child, depth + 1, layer.id, false);
    }
  };
  for (let i = space.layers.length - 1; i >= 0; i--) visitLayer(space.layers[i] as Layer, 0, null);
  return rows;
}

export type DropPosition = 'before' | 'after' | 'inside';

export type DropPlan =
  | { type: 'moveLayer'; layerId: string; parentId: string | null; index: number }
  | { type: 'moveNodes'; ids: string[]; layerId: string; index: number }
  | null;

/**
 * What dropping a dragged layer or object on a row means. "before" is visually above the target, which
 * is *after* it in the z-order arrays (index 0 is the bottom).
 */
export function planDrop(space: Space, drag: { kind: 'layer' | 'node'; ids: string[] }, targetId: string, position: DropPosition): DropPlan {
  const targetLayer = locateLayer(space, targetId);
  const targetNode = targetLayer ? null : locateNode(space, targetId);
  if (!targetLayer && !targetNode) return null;
  const bump = position === 'before' ? 1 : 0;

  if (drag.kind === 'layer') {
    const id = drag.ids[0];
    if (!id || id === targetId) return null;
    if (targetLayer) {
      if (position === 'inside') return { type: 'moveLayer', layerId: id, parentId: targetId, index: targetLayer.layer.children.length };
      const container = (targetLayer.siblings as LayerChild[]).filter((c) => c.id !== id);
      const at = container.findIndex((c) => c.id === targetId);
      return { type: 'moveLayer', layerId: id, parentId: targetLayer.parent?.id ?? null, index: at + bump };
    }
    // Dropping a layer next to an object: into the layer that holds the object.
    if (targetNode) {
      const siblings = (targetNode.layer.children as LayerChild[]).filter((c) => c.id !== id);
      const at = siblings.findIndex((c) => c.id === targetId);
      return { type: 'moveLayer', layerId: id, parentId: targetNode.layer.id, index: at === -1 ? siblings.length : at + bump };
    }
    return null;
  }

  const ids = drag.ids;
  if (ids.length === 0 || ids.includes(targetId)) return null;
  if (targetLayer) {
    if (position === 'inside' || targetLayer.layer.children.length === 0) return { type: 'moveNodes', ids, layerId: targetId, index: targetLayer.layer.children.filter((c) => !ids.includes(c.id)).length };
    // Next to a layer row: into that layer's container is not possible for objects: put them on top of it.
    return { type: 'moveNodes', ids, layerId: targetId, index: targetLayer.layer.children.filter((c) => !ids.includes(c.id)).length };
  }
  if (targetNode) {
    // Only direct children of a layer can be reordered here (groups keep their order).
    if (!(targetNode.layer.children as LayerChild[]).some((c) => c.id === targetId)) return null;
    const siblings = (targetNode.layer.children as LayerChild[]).filter((c) => !ids.includes(c.id));
    const at = siblings.findIndex((c) => c.id === targetId);
    return { type: 'moveNodes', ids, layerId: targetNode.layer.id, index: at + bump };
  }
  return null;
}

/** The ids of the layer and its ancestors, to expand them when revealing an object. */
export function ancestorIds(space: Space, id: string): { layers: string[]; groups: string[] } {
  const found = locateNode(space, id);
  if (!found) return { layers: [], groups: [] };
  const layers: string[] = [];
  let at = locateLayer(space, found.layer.id);
  while (at) {
    layers.push(at.layer.id);
    at = at.parent ? locateLayer(space, at.parent.id) : null;
  }
  const groups: string[] = [];
  const walk = (children: readonly LayerChild[]): boolean => {
    for (const child of children) {
      if (isLayer(child)) {
        if (walk(child.children)) return true;
        continue;
      }
      if (child.id === id) return true;
      if (child.type === 'group' || child.type === 'clipGroup') {
        if (walk(child.children)) {
          groups.push(child.id);
          return true;
        }
      }
    }
    return false;
  };
  walk(space.layers);
  return { layers, groups };
}

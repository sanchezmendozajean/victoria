import { getSpace, isLayer, locateNode } from '../model/queries';
import type { Document, LayerChild, Node, Space } from '../model/types';

/** The selection is per document and not part of the history, but each history entry restores it. */
export interface Selection {
  spaceId: string;
  /** Ids of selected nodes, in selection order (the last one is the "key object"). */
  ids: string[];
}

export const emptySelection = (spaceId: string): Selection => ({ spaceId, ids: [] });

export function selectOnly(spaceId: string, ids: string[]): Selection {
  return { spaceId, ids: [...new Set(ids)] };
}

export function addToSelection(selection: Selection, ids: string[]): Selection {
  return { ...selection, ids: [...new Set([...selection.ids, ...ids])] };
}

export function removeFromSelection(selection: Selection, ids: string[]): Selection {
  const drop = new Set(ids);
  return { ...selection, ids: selection.ids.filter((id) => !drop.has(id)) };
}

/** Shift+click: adds when absent, removes when present. */
export function toggleInSelection(selection: Selection, id: string): Selection {
  return selection.ids.includes(id) ? removeFromSelection(selection, [id]) : addToSelection(selection, [id]);
}

const isSelectable = (node: Node) => node.visible && !node.locked;

function collectSelectable(children: readonly LayerChild[]): string[] {
  return children.flatMap((child) => {
    if (!isLayer(child)) return isSelectable(child) ? [child.id] : [];
    // Hidden or locked layers hide their whole subtree, sublayers included.
    return child.visible && !child.locked ? collectSelectable(child.children) : [];
  });
}

/** Top-level objects of visible, unlocked layers and sublayers (Ctrl+A). */
export function selectableIds(space: Space): string[] {
  return collectSelectable(space.layers);
}

export function selectAllInSpace(doc: Document, spaceId: string): Selection {
  const space = getSpace(doc, spaceId);
  return selectOnly(spaceId, space ? selectableIds(space) : []);
}

/** Drops ids that no longer exist (after delete, undo…). A missing Space gives an empty selection. */
export function pruneSelection(doc: Document, selection: Selection): Selection {
  const space = getSpace(doc, selection.spaceId);
  if (!space) return emptySelection(doc.activeSpaceId);
  const ids = selection.ids.filter((id) => locateNode(space, id) !== null);
  return ids.length === selection.ids.length ? selection : { spaceId: selection.spaceId, ids };
}

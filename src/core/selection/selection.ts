import { pathFrameOf } from '../geometry/world';
import { getSpace, isLayer, locateNode } from '../model/queries';
import type { Document, LayerChild, Node, Space } from '../model/types';

/**
 * The selection is per document and not part of the history, but each history entry restores it.
 * `ids` are selected objects; `anchors` (Direct Selection) map a path id to the indices of its selected anchors.
 */
export interface Selection {
  spaceId: string;
  /** Ids of selected nodes, in selection order (the last one is the "key object"). */
  ids: string[];
  anchors?: { [pathId: string]: number[] };
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

export const isSelected = (selection: Selection, id: string): boolean => selection.ids.includes(id);

// ── Anchors (Direct Selection) ──

export function selectedAnchorIndices(selection: Selection, pathId: string): number[] {
  return selection.anchors?.[pathId] ?? [];
}

export const hasAnchorSelection = (selection: Selection): boolean => Object.values(selection.anchors ?? {}).some((a) => a.length > 0);

/** Replaces the selected anchors; objects stay selected so their anchors remain visible. */
export function withAnchors(selection: Selection, anchors: { [pathId: string]: number[] }): Selection {
  const clean: { [pathId: string]: number[] } = {};
  for (const [id, list] of Object.entries(anchors)) if (list.length > 0) clean[id] = [...new Set(list)].sort((a, b) => a - b);
  return { ...selection, anchors: clean };
}

export function toggleAnchor(selection: Selection, pathId: string, index: number): Selection {
  const current = selectedAnchorIndices(selection, pathId);
  const next = current.includes(index) ? current.filter((i) => i !== index) : [...current, index];
  return withAnchors(selection, { ...selection.anchors, [pathId]: next });
}

export function addAnchors(selection: Selection, pathId: string, indices: number[]): Selection {
  return withAnchors(selection, { ...selection.anchors, [pathId]: [...selectedAnchorIndices(selection, pathId), ...indices] });
}

// ── Collections ──

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
  let anchors = selection.anchors;
  if (anchors) {
    const kept: { [pathId: string]: number[] } = {};
    for (const [pathId, list] of Object.entries(anchors)) {
      const frame = pathFrameOf(space, pathId);
      const valid = frame ? list.filter((i) => i >= 0 && i < frame.path.anchors.length) : [];
      if (valid.length > 0) kept[pathId] = valid;
    }
    anchors = kept;
  }
  if (ids.length === selection.ids.length && anchors === selection.anchors) return selection;
  const result: Selection = { spaceId: selection.spaceId, ids };
  if (anchors && Object.keys(anchors).length > 0) result.anchors = anchors;
  return result;
}

import {
  arrangeNodes,
  cloneNodes,
  createGroup,
  duplicateNodes,
  emptySelection,
  getActiveSpace,
  groupNodes,
  hasAnchorSelection,
  intersects,
  locateNode,
  nodeWorldBounds,
  removeNodes,
  selectableIds,
  selectOnly,
  setAllNodesProps,
  setNodeProps,
  transformNodes,
  ungroupNodes,
  type ArrangeDirection,
  type DocumentSession,
  type Matrix,
  type Node,
  type Selection,
  type Space,
} from '../../core';
import { manager } from '../documents';
import { lastSelectionOf } from '../documents/manager';
import { topLevelIds } from '../tools/shared';
import { useUi } from './store';

export interface ActionContext {
  session: DocumentSession;
  space: Space;
  selection: Selection;
  /** Selected objects that are not inside another selected object. */
  ids: string[];
}

export function actionContext(): ActionContext | null {
  const session = manager.active?.session;
  if (!session) return null;
  const space = getActiveSpace(session.document);
  const selection = session.selection.spaceId === space.id ? session.selection : emptySelection(space.id);
  return { session, space, selection, ids: topLevelIds(space, selection.ids) };
}

/** Delete. With anchors selected the key belongs to Direct Selection's anchor deletion (Phase 5). */
export function deleteSelection(): void {
  const c = actionContext();
  if (!c || c.ids.length === 0 || hasAnchorSelection(c.selection)) return;
  c.session.run(removeNodes(c.space.id, c.ids), emptySelection(c.space.id));
}

export function groupSelection(): void {
  const c = actionContext();
  if (!c || c.ids.length < 1) return;
  const group = createGroup(c.session.ids, []);
  c.session.run(groupNodes(c.space.id, c.ids, group), selectOnly(c.space.id, [group.id]));
}

export function ungroupSelection(): void {
  const c = actionContext();
  if (!c) return;
  const groups = c.ids.map((id) => locateNode(c.space, id)?.node).filter((n): n is Node => !!n && n.type === 'group');
  if (groups.length === 0) return;
  const children = groups.flatMap((g) => (g.type === 'group' ? g.children.map((n) => n.id) : []));
  c.session.run(ungroupNodes(c.space.id, groups.map((g) => g.id)), selectOnly(c.space.id, children));
}

export function arrangeSelection(direction: ArrangeDirection): void {
  const c = actionContext();
  if (c && c.ids.length > 0) c.session.run(arrangeNodes(c.space.id, c.ids, direction));
}

/** Locking and hiding take the objects out of the selection, as in Illustrator. */
export function lockSelection(): void {
  const c = actionContext();
  if (c && c.ids.length > 0) c.session.run(setNodeProps(c.space.id, c.ids, { locked: true }), emptySelection(c.space.id));
}

export function hideSelection(): void {
  const c = actionContext();
  if (c && c.ids.length > 0) c.session.run(setNodeProps(c.space.id, c.ids, { visible: false }), emptySelection(c.space.id));
}

export function unlockAll(): void {
  const c = actionContext();
  if (c) c.session.run(setAllNodesProps(c.space.id, { locked: false }));
}

export function showAll(): void {
  const c = actionContext();
  if (c) c.session.run(setAllNodesProps(c.space.id, { visible: true }));
}

export function selectAll(): void {
  const c = actionContext();
  if (c) c.session.select(selectOnly(c.space.id, selectableIds(c.space)));
}

export function selectNone(): void {
  const c = actionContext();
  if (c) c.session.select(emptySelection(c.space.id));
}

/** Selección › Volver a seleccionar: the last non-empty selection. */
export function reselect(): void {
  const c = actionContext();
  const previous = c ? lastSelectionOf(c.session) : undefined;
  if (c && previous && previous.spaceId === c.space.id) c.session.select(previous);
}

export function selectAllInArtboard(): void {
  const c = actionContext();
  if (!c) return;
  const active = useUi.getState().activeArtboard[c.space.id];
  const board = c.space.artboards.find((a) => a.id === active) ?? c.space.artboards[0];
  if (!board) return;
  const area = { minX: board.x, minY: board.y, maxX: board.x + board.w, maxY: board.y + board.h };
  const inside = selectableIds(c.space).filter((id) => {
    const b = nodeWorldBounds(c.space, id);
    return !!b && intersects(b, area);
  });
  c.session.select(selectOnly(c.space.id, inside));
}

let dialogCounter = 0;
export const nextTransformKey = (): string => `dlg${++dialogCounter}`;

/**
 * Applies `matrix` (in Space coordinates) to the objects, or to copies of them. Returns the ids that
 * hold the result, so callers can keep them selected.
 */
export function applyTransform(session: DocumentSession, space: Space, ids: readonly string[], matrix: Matrix, copy: boolean, key?: string): string[] {
  if (!copy) {
    session.run(transformNodes(space.id, ids, matrix, key));
    return [...ids];
  }
  const nodes = ids.map((id) => locateNode(space, id)?.node).filter((n): n is Node => !!n);
  const clones = cloneNodes(nodes, session.ids);
  const cloneIds = clones.map((n) => n.id);
  session.run(duplicateNodes(space.id, ids, clones, matrix, key), selectOnly(space.id, cloneIds));
  return cloneIds;
}

/** Objeto › Transformar de nuevo (Ctrl+D). */
export function transformAgain(): void {
  const c = actionContext();
  const last = useUi.getState().lastTransform;
  if (!c || !last || c.ids.length === 0) return;
  applyTransform(c.session, c.space, c.ids, last.matrix, last.copy);
}

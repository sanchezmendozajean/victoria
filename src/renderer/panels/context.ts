import { emptySelection, getActiveSpace, paintTargets, type DocumentSession, type Node, type Resources, type Selection, type Space } from '../../core';
import { useDocuments } from '../documents';
import { topLevelIds } from '../tools/shared';
import { lookOf, type Look } from './look';
import { useUi } from '../app/store';

export interface PanelContext {
  session: DocumentSession;
  space: Space;
  resources: Resources;
  selection: Selection;
  /** Selected objects that are not inside another selected object. */
  ids: string[];
  /** The objects whose appearance a panel edits (groups stand for what is inside them). */
  leaves: Node[];
  look: Look;
}

/** Everything a panel needs about the active document and its selection; null without a document. Re-renders on any change. */
export function usePanelContext(): PanelContext | null {
  const documents = useDocuments();
  const newLook = useUi((s) => s.newLook);
  const session = documents.active?.session;
  if (!session) return null;
  const space = getActiveSpace(session.document);
  const selection = session.selection.spaceId === space.id ? session.selection : emptySelection(space.id);
  const ids = topLevelIds(space, selection.ids);
  const leaves = paintTargets(space, ids);
  return { session, space, resources: session.document.resources, selection, ids, leaves, look: lookOf(leaves, newLook) };
}

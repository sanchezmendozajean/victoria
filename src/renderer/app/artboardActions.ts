import {
  addArtboard,
  arrangeArtboards,
  createArtboard,
  fitArtboardToArtwork,
  frameOf,
  getActiveSpace,
  removeArtboard,
  reorderArtboard,
  updateArtboard,
  type Artboard,
  type ArrangeOptions,
  type DocumentSession,
  type Node,
  type Space,
} from '../../core';
import { t } from '../i18n';
import { topLevelIds } from '../tools/shared';
import { useUi } from './store';

/** What the Artboards panel and its dialog do to the active Space. Every change is one undoable command. */

export const activeArtboardOf = (space: Space): Artboard | undefined => {
  const id = useUi.getState().activeArtboard[space.id];
  return space.artboards.find((a) => a.id === id) ?? space.artboards[0];
};

const select = (space: Space, id: string) => useUi.getState().setActiveArtboard(space.id, id);

/** New artboard of the size of the active one, to the right of the last. */
export function newArtboardIn(session: DocumentSession): void {
  const space = getActiveSpace(session.document);
  const base = activeArtboardOf(space);
  const last = space.artboards[space.artboards.length - 1] ?? base;
  if (!base || !last) return;
  const board = createArtboard(session.ids, {
    name: t('doc.defaultArtboard', { n: space.artboards.length + 1 }),
    x: last.x + last.w + 40,
    y: last.y,
    w: base.w,
    h: base.h,
    ...(base.preset !== undefined ? { preset: base.preset } : {}),
  });
  session.run(addArtboard(space.id, board));
  select(space, board.id);
}

/** A copy of the artboard (not its artwork) right after it in the list, placed to the right of the last board. */
export function duplicateArtboardOf(session: DocumentSession, id: string): void {
  const space = getActiveSpace(session.document);
  const source = space.artboards.find((a) => a.id === id);
  const last = space.artboards[space.artboards.length - 1];
  if (!source || !last) return;
  const copy: Artboard = {
    ...createArtboard(session.ids, {
      name: t('doc.defaultArtboard', { n: space.artboards.length + 1 }),
      x: last.x + last.w + 40,
      y: source.y,
      w: source.w,
      h: source.h,
      ...(source.preset !== undefined ? { preset: source.preset } : {}),
    }),
    bleed: { ...source.bleed },
    background: source.background,
    showCenterMark: source.showCenterMark,
    showCrossHairs: source.showCrossHairs,
    showVideoSafe: source.showVideoSafe,
  };
  session.run(addArtboard(space.id, copy, space.artboards.indexOf(source) + 1));
  select(space, copy.id);
}

/** A Space keeps at least one artboard. */
export function deleteArtboardOf(session: DocumentSession, id: string): void {
  const space = getActiveSpace(session.document);
  if (space.artboards.length <= 1) return;
  session.run(removeArtboard(space.id, id));
  if (useUi.getState().activeArtboard[space.id] === id) select(space, space.artboards.find((a) => a.id !== id)?.id ?? '');
}

export function shiftArtboard(session: DocumentSession, id: string, delta: -1 | 1): void {
  const space = getActiveSpace(session.document);
  const index = space.artboards.findIndex((a) => a.id === id);
  if (index < 0) return;
  session.run(reorderArtboard(space.id, id, index + delta));
}

export const renameArtboardOf = (session: DocumentSession, id: string, name: string): void => {
  const space = getActiveSpace(session.document);
  const clean = name.trim();
  if (clean) session.run(updateArtboard(space.id, id, { name: clean }));
};

/** Resizes the artboard to all visible artwork. */
export function fitToArtwork(session: DocumentSession, id: string): void {
  const space = getActiveSpace(session.document);
  const command = fitArtboardToArtwork(space, id, null);
  if (command) session.run(command);
}

/** Resizes the artboard to the selected objects. */
export function fitToSelection(session: DocumentSession, id: string): void {
  const space = getActiveSpace(session.document);
  const selection = session.selection;
  if (selection.spaceId !== space.id || selection.ids.length === 0) return;
  const nodes = topLevelIds(space, selection.ids).flatMap((nodeId): Node[] => {
    const node = frameOf(space, nodeId)?.node;
    return node ? [node] : [];
  });
  const command = fitArtboardToArtwork(space, id, nodes);
  if (command) session.run(command);
}

export function arrangeAll(session: DocumentSession, options: ArrangeOptions, moveArtwork: boolean): void {
  const command = arrangeArtboards(getActiveSpace(session.document), options, moveArtwork);
  if (command) session.run(command);
}

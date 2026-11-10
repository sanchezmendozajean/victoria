import type { Draft } from 'immer';
import { arrangeBoards, artworkBounds, artworkOnBoard, topLevelNodes, type ArrangeOptions } from '../model/artboardLayout';
import { translation } from '../model/matrix';
import type { Artboard, Document, Node, Space } from '../model/types';
import { combineCommands, type Command } from './command';
import { transformNodes } from './node';

const findSpace = (d: Draft<Document>, id: string) => d.spaces.find((s) => s.id === id);

export const addArtboard = (spaceId: string, artboard: Artboard, index?: number): Command => ({
  label: 'artboard.add',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    space.artboards.splice(index ?? space.artboards.length, 0, artboard);
  },
});

/** A Space keeps at least one artboard (as in Illustrator): removing the last one does nothing. */
export const removeArtboard = (spaceId: string, artboardId: string): Command => ({
  label: 'artboard.remove',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space || space.artboards.length <= 1) return;
    space.artboards = space.artboards.filter((a) => a.id !== artboardId);
  },
});

export type ArtboardPatch = Partial<Omit<Artboard, 'id'>>;

/** Moves, resizes, renames… Pass `mergeKey` while dragging so the gesture is a single undo step. */
export const updateArtboard = (spaceId: string, artboardId: string, patch: ArtboardPatch, mergeKey?: string): Command => ({
  label: 'artboard.update',
  spaceId,
  ...(mergeKey ? { mergeKey: `artboard.update:${artboardId}:${mergeKey}` } : {}),
  apply: (d) => {
    const artboard = findSpace(d, spaceId)?.artboards.find((a) => a.id === artboardId);
    if (artboard) Object.assign(artboard, patch);
  },
});

/** The order of artboards drives export and print order. */
export const reorderArtboard = (spaceId: string, artboardId: string, toIndex: number): Command => ({
  label: 'artboard.reorder',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    const from = space.artboards.findIndex((a) => a.id === artboardId);
    if (from === -1) return;
    const target = Math.max(0, Math.min(toIndex, space.artboards.length - 1));
    if (target === from) return;
    const [moved] = space.artboards.splice(from, 1);
    space.artboards.splice(target, 0, moved as Draft<Artboard>);
  },
});

/**
 * Lays the artboards of a Space out in a grid (list order). With `moveArtwork` each board carries the objects
 * on it, as the Artboard tool does. Null when nothing would move.
 */
export const arrangeArtboards = (space: Space, options: ArrangeOptions, moveArtwork: boolean): Command | null => {
  const targets = arrangeBoards(space.artboards, options);
  // Decide who owns each object before anything moves, so overlapping boards never move it twice.
  const taken = new Set<string>();
  const commands: Command[] = [];
  for (const board of space.artboards) {
    const to = targets.get(board.id);
    if (!to || (to.x === board.x && to.y === board.y)) continue;
    commands.push(updateArtboard(space.id, board.id, { x: to.x, y: to.y }));
    if (!moveArtwork) continue;
    const ids = artworkOnBoard(space, board).filter((id) => !taken.has(id));
    for (const id of ids) taken.add(id);
    if (ids.length > 0) commands.push(transformNodes(space.id, ids, translation(to.x - board.x, to.y - board.y)));
  }
  return commands.length > 0 ? combineCommands('artboard.arrange', commands) : null;
};

/** Resizes an artboard to the visual bounds of the given objects (all visible artwork when `nodes` is null). */
export const fitArtboardToArtwork = (space: Space, artboardId: string, nodes: readonly Node[] | null): Command | null => {
  const b = artworkBounds(space, nodes ?? topLevelNodes(space));
  if (!b) return null;
  const w = Math.max(1, b.maxX - b.minX);
  const h = Math.max(1, b.maxY - b.minY);
  return combineCommands('artboard.fit', [updateArtboard(space.id, artboardId, { x: b.minX, y: b.minY, w, h })]);
};

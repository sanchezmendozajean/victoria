import type { Draft } from 'immer';
import type { Artboard, Document } from '../model/types';
import type { Command } from './command';

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

import type { Draft } from 'immer';
import { isLayer, locateLayer, walkLayers } from '../model/queries';
import type { Document, Layer, LayerChild } from '../model/types';
import type { Command } from './command';

type DraftChild = Draft<LayerChild>;

const findSpace = (d: Draft<Document>, id: string) => d.spaces.find((s) => s.id === id);

/** The array a new layer goes into: the Space's layers, or the children of `parentLayerId` (a sublayer). */
function containerOf(d: Draft<Document>, spaceId: string, parentLayerId: string | null): DraftChild[] | null {
  const space = findSpace(d, spaceId);
  if (!space) return null;
  if (parentLayerId === null) return space.layers as DraftChild[];
  return (locateLayer(space, parentLayerId)?.layer.children as DraftChild[] | undefined) ?? null;
}

/** Adds a layer at the top level, or as a sublayer of `parentLayerId` (mixed with its objects in z-order). */
export const addLayer = (spaceId: string, layer: Layer, index?: number, parentLayerId: string | null = null): Command => ({
  label: parentLayerId === null ? 'layer.add' : 'layer.addSublayer',
  spaceId,
  apply: (d) => {
    const container = containerOf(d, spaceId, parentLayerId);
    if (container) container.splice(index ?? container.length, 0, layer as DraftChild);
  },
});

/** A Space keeps at least one top-level layer. Removing a layer deletes its sublayers and objects. */
export const removeLayer = (spaceId: string, layerId: string): Command => ({
  label: 'layer.remove',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateLayer(space, layerId) : null;
    if (!found || (found.parent === null && space && space.layers.length <= 1)) return;
    found.siblings.splice(found.index, 1);
  },
});

export type LayerPatch = Partial<Pick<Layer, 'name' | 'color' | 'visible' | 'locked' | 'outline'>>;

export const updateLayer = (spaceId: string, layerId: string, patch: LayerPatch): Command => ({
  label: 'layer.update',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateLayer(space, layerId) : null;
    if (found) Object.assign(found.layer, patch);
  },
});

/** Moves a layer within the list that holds it. Index 0 is the bottom. */
export const reorderLayer = (spaceId: string, layerId: string, toIndex: number): Command => ({
  label: 'layer.reorder',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateLayer(space, layerId) : null;
    if (!found) return;
    const target = Math.max(0, Math.min(toIndex, found.siblings.length - 1));
    if (target === found.index) return;
    const [moved] = found.siblings.splice(found.index, 1);
    found.siblings.splice(target, 0, moved as DraftChild);
  },
});

/**
 * Drag a layer into another layer (as a sublayer) or back to the top level (`parentLayerId` null).
 * A layer cannot go inside itself or its own sublayers, and the last top-level layer cannot leave.
 */
export const moveLayer = (spaceId: string, layerId: string, parentLayerId: string | null, index?: number): Command => ({
  label: 'layer.move',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    const found = space ? locateLayer(space, layerId) : null;
    if (!space || !found) return;
    if (parentLayerId !== null) {
      const inside = [found.layer, ...walkLayers(found.layer.children.filter(isLayer))];
      if (inside.some((l) => l.id === parentLayerId)) return;
    }
    if (found.parent === null && parentLayerId !== null && space.layers.length <= 1) return;
    const target = containerOf(d, spaceId, parentLayerId);
    if (!target) return;
    const [moved] = found.siblings.splice(found.index, 1);
    target.splice(index ?? target.length, 0, moved as DraftChild);
  },
});

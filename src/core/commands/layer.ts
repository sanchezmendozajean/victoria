import type { Draft } from 'immer';
import type { Document, Layer } from '../model/types';
import type { Command } from './command';

const findSpace = (d: Draft<Document>, id: string) => d.spaces.find((s) => s.id === id);

export const addLayer = (spaceId: string, layer: Layer, index?: number): Command => ({
  label: 'layer.add',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (space) space.layers.splice(index ?? space.layers.length, 0, layer);
  },
});

/** A Space keeps at least one layer; removing a layer deletes its objects. */
export const removeLayer = (spaceId: string, layerId: string): Command => ({
  label: 'layer.remove',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space || space.layers.length <= 1) return;
    space.layers = space.layers.filter((l) => l.id !== layerId);
  },
});

export type LayerPatch = Partial<Pick<Layer, 'name' | 'color' | 'visible' | 'locked'>>;

export const updateLayer = (spaceId: string, layerId: string, patch: LayerPatch): Command => ({
  label: 'layer.update',
  spaceId,
  apply: (d) => {
    const layer = findSpace(d, spaceId)?.layers.find((l) => l.id === layerId);
    if (layer) Object.assign(layer, patch);
  },
});

/** Index 0 is the bottom layer. */
export const reorderLayer = (spaceId: string, layerId: string, toIndex: number): Command => ({
  label: 'layer.reorder',
  spaceId,
  apply: (d) => {
    const space = findSpace(d, spaceId);
    if (!space) return;
    const from = space.layers.findIndex((l) => l.id === layerId);
    if (from === -1) return;
    const target = Math.max(0, Math.min(toIndex, space.layers.length - 1));
    if (target === from) return;
    const [moved] = space.layers.splice(from, 1);
    space.layers.splice(target, 0, moved as Draft<Layer>);
  },
});

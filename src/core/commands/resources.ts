import { deepClone } from '../model/deepClone';
import type { Draft } from 'immer';
import { childrenOf } from '../model/queries';
import type { Appearance, Document, FontResource, Gradient, ImageResource, LayerChild, ModifierPreset, Node, Swatch } from '../model/types';
import type { Command } from './command';

export const addSwatch = (swatch: Swatch): Command => ({
  label: 'resource.swatch.add',
  apply: (d) => {
    d.resources.swatches.push(swatch);
  },
});

export const updateSwatch = (swatchId: string, patch: Partial<Omit<Swatch, 'id'>>, mergeKey?: string): Command => ({
  label: 'resource.swatch.update',
  ...(mergeKey ? { mergeKey: `resource.swatch.update:${swatchId}:${mergeKey}` } : {}),
  apply: (d) => {
    const swatch = d.resources.swatches.find((s) => s.id === swatchId);
    if (swatch) Object.assign(swatch, patch);
  },
});

function detachSwatchFrom(appearance: Draft<Appearance>, swatch: Swatch): void {
  for (const item of appearance.items) {
    if (item.kind !== 'modifier' && item.paint.type === 'swatch' && item.paint.swatchId === swatch.id) {
      item.paint = { type: 'solid', color: deepClone(swatch.color) };
    }
  }
}

function detachSwatchInNodes(nodes: Draft<Node>[], swatch: Swatch): void {
  for (const node of nodes) {
    detachSwatchFrom(node.appearance, swatch);
    const inner = childrenOf(node);
    if (inner) detachSwatchInNodes(inner as Draft<Node>[], swatch);
    if (node.type === 'compound') node.children.forEach((c) => detachSwatchFrom(c.appearance, swatch));
  }
}

function detachSwatchInChildren(children: Draft<LayerChild>[], swatch: Swatch): void {
  for (const child of children) {
    if (child.type === 'layer') detachSwatchInChildren(child.children, swatch);
    else detachSwatchInNodes([child as Draft<Node>], swatch);
  }
}

/** Objects that used the swatch keep its colour as a plain solid paint. */
export const removeSwatch = (swatchId: string): Command => ({
  label: 'resource.swatch.remove',
  apply: (d: Draft<Document>) => {
    const swatch = d.resources.swatches.find((s) => s.id === swatchId);
    if (!swatch) return;
    const snapshot = deepClone(swatch) as Swatch;
    for (const space of d.spaces) detachSwatchInChildren(space.layers as Draft<LayerChild>[], snapshot);
    d.resources.swatches = d.resources.swatches.filter((s) => s.id !== swatchId);
  },
});

export const addGradient = (gradient: Gradient): Command => ({
  label: 'resource.gradient.add',
  apply: (d) => {
    d.resources.gradients.push(gradient);
  },
});

export const addImageResource = (hash: string, image: ImageResource): Command => ({
  label: 'resource.image.add',
  apply: (d) => {
    d.resources.images[hash] = image;
  },
});

export const addFontResource = (hash: string, font: FontResource): Command => ({
  label: 'resource.font.add',
  apply: (d) => {
    d.resources.fonts[hash] = font;
  },
});

export const addModifierPreset = (preset: ModifierPreset): Command => ({
  label: 'resource.modifierPreset.add',
  apply: (d) => {
    d.resources.modifierPresets.push(preset);
  },
});

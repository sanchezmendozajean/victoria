import type { IconId } from '../icons/catalog.generated';
import type { TranslationKey } from '../i18n';

export type PanelId =
  | 'properties'
  | 'layers'
  | 'spaces'
  | 'fill'
  | 'swatches'
  | 'gradient'
  | 'stroke'
  | 'appearance'
  | 'character'
  | 'paragraph'
  | 'align'
  | 'spacing'
  | 'transform'
  | 'pathfinder'
  | 'trace'
  | 'artboards';

export interface PanelMeta {
  title: TranslationKey;
  icon: IconId;
}

/** Panel tab icons as in the approved mockup (design/screens/Panels.dc.html). */
export const PANELS: Record<PanelId, PanelMeta> = {
  properties: { title: 'panel.properties', icon: 'properties' },
  layers: { title: 'panel.layers', icon: 'layers' },
  spaces: { title: 'panel.spaces', icon: 'spaces' },
  fill: { title: 'panel.fill', icon: 'fill' },
  swatches: { title: 'panel.swatches', icon: 'swatches' },
  gradient: { title: 'panel.gradient', icon: 'paint-gradient' },
  stroke: { title: 'panel.stroke', icon: 'stroke-weight' },
  appearance: { title: 'panel.appearance', icon: 'appearance' },
  character: { title: 'panel.character', icon: 'type' },
  paragraph: { title: 'panel.paragraph', icon: 'pilcrow' },
  align: { title: 'panel.align', icon: 'align-hcenter' },
  spacing: { title: 'panel.spacing', icon: 'space-horizontal' },
  transform: { title: 'panel.transform', icon: 'transform' },
  pathfinder: { title: 'panel.pathfinder', icon: 'pf-unite' },
  trace: { title: 'panel.trace', icon: 'trace-image' },
  artboards: { title: 'panel.artboards', icon: 'tool-artboard' },
};

export const PANEL_ORDER = Object.keys(PANELS) as PanelId[];

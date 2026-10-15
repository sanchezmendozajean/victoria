import type { IdGenerator } from './ids';
import { IDENTITY } from './matrix';
import { findPreset, NO_BLEED, SPACE_COLORS } from './presets';
import type {
  Appearance,
  Artboard,
  BaseNode,
  ClipGroupNode,
  Color,
  Document,
  GroupNode,
  Layer,
  PathNode,
  PathTextOptions,
  ShapeNode,
  Space,
  TextNode,
  TextPath,
  TextRun,
  StrokeStyle,
  Anchor,
} from './types';

export const CURRENT_FORMAT_VERSION = 2;

export const WHITE: Color = { model: 'rgb', values: [255, 255, 255] };
export const BLACK: Color = { model: 'rgb', values: [0, 0, 0] };

export function defaultStroke(): StrokeStyle {
  return {
    width: 1,
    cap: 'butt',
    join: 'miter',
    miterLimit: 10,
    align: 'center',
    dash: null,
    dashAlignToCorners: false,
    arrowScale: [100, 100],
  };
}

/** A new object has [fill, stroke]: white fill and 1 pt black stroke (specs/02 · Apariencia). */
export function defaultAppearance(): Appearance {
  return {
    items: [
      { kind: 'fill', paint: { type: 'solid', color: WHITE }, opacity: 1, modifiers: [] },
      { kind: 'stroke', paint: { type: 'solid', color: BLACK }, stroke: defaultStroke(), opacity: 1, modifiers: [] },
    ],
  };
}

function baseNode(ids: IdGenerator): Omit<BaseNode, 'type'> {
  return {
    id: ids(),
    visible: true,
    locked: false,
    transform: [...IDENTITY],
    appearance: defaultAppearance(),
    opacity: 1,
    blendMode: 'normal',
  };
}

export function createPath(ids: IdGenerator, anchors: Anchor[], closed = false): PathNode {
  return { ...baseNode(ids), type: 'path', closed, anchors };
}

export function createGroup(ids: IdGenerator, children: GroupNode['children']): GroupNode {
  return { ...baseNode(ids), type: 'group', children };
}

export function createClipGroup(ids: IdGenerator, children: ClipGroupNode['children'] = []): ClipGroupNode {
  return { ...baseNode(ids), type: 'clipGroup', children };
}

export function createRect(ids: IdGenerator, w: number, h: number, radius = 0): ShapeNode {
  return {
    ...baseNode(ids),
    type: 'shape',
    shape: 'rect',
    params: { w, h, radii: [radius, radius, radius, radius], cornerType: 'round' },
  };
}

export function createEllipse(ids: IdGenerator, w: number, h: number): ShapeNode {
  return { ...baseNode(ids), type: 'shape', shape: 'ellipse', params: { w, h, startAngle: 0, endAngle: 360 } };
}

export function createPolygon(ids: IdGenerator, radius: number, sides: number, cornerRadius = 0): ShapeNode {
  return { ...baseNode(ids), type: 'shape', shape: 'polygon', params: { radius, sides, cornerRadius } };
}

export function createStar(ids: IdGenerator, r1: number, r2: number, points: number, cornerRadius = 0): ShapeNode {
  return { ...baseNode(ids), type: 'shape', shape: 'star', params: { r1, r2, points, cornerRadius } };
}

/** A segment along +X from the local origin; place and rotate it with `transform`. */
export function createLine(ids: IdGenerator, length: number): ShapeNode {
  const node: ShapeNode = { ...baseNode(ids), type: 'shape', shape: 'line', params: { length } };
  // A line has no area: it is stroked only.
  node.appearance.items = node.appearance.items.filter((i) => i.kind === 'stroke');
  return node;
}

/** Text takes a plain black fill and no stroke (Illustrator's text default), not the current look. */
export function textAppearance(): Appearance {
  return { items: [{ kind: 'fill', paint: { type: 'solid', color: BLACK }, opacity: 1, modifiers: [] }] };
}

export type NewText =
  | { kind: 'point' }
  | { kind: 'area'; frame: TextPath }
  | { kind: 'onPath'; path: TextPath; options?: PathTextOptions };

export function createText(ids: IdGenerator, spec: NewText, story: TextRun[]): TextNode {
  const node: TextNode = { ...baseNode(ids), type: 'text', kind: spec.kind, story, appearance: textAppearance() };
  if (spec.kind === 'area') node.frame = spec.frame;
  if (spec.kind === 'onPath') {
    node.path = spec.path;
    node.pathOptions = spec.options ?? { effect: 'rainbow', align: 'baseline', spacing: 0, flip: false, start: 0, end: 1 };
  }
  return node;
}

export function createLayer(ids: IdGenerator, name: string, color = '#4C8DFF'): Layer {
  return { type: 'layer', id: ids(), name, color, visible: true, locked: false, children: [] };
}

export interface ArtboardInit {
  name: string;
  x?: number;
  y?: number;
  w: number;
  h: number;
  preset?: string;
}

export function createArtboard(ids: IdGenerator, init: ArtboardInit): Artboard {
  const artboard: Artboard = {
    id: ids(),
    name: init.name,
    x: init.x ?? 0,
    y: init.y ?? 0,
    w: init.w,
    h: init.h,
    bleed: { ...NO_BLEED },
    background: 'transparent',
    showCenterMark: false,
    showCrossHairs: false,
    showVideoSafe: false,
  };
  if (init.preset !== undefined) artboard.preset = init.preset;
  return artboard;
}

export interface SpaceInit {
  name: string;
  /** Defaults to the next colour of the palette, by `order`. */
  color?: string;
  order?: number;
  artboards?: Artboard[];
  layers?: Layer[];
}

export function createSpace(ids: IdGenerator, init: SpaceInit): Space {
  const order = init.order ?? 0;
  return {
    id: ids(),
    name: init.name,
    color: init.color ?? (SPACE_COLORS[order % SPACE_COLORS.length] as string),
    order,
    excludeFromExport: false,
    canvasColor: null,
    view: { zoom: 1, panX: 0, panY: 0 },
    guides: [],
    grid: { size: 72, subdivisions: 8, visible: false },
    artboards: init.artboards ?? [],
    layers: init.layers ?? [],
  };
}

export interface DocumentInit {
  /** User-visible names come from the UI (the core has no i18n). */
  name: string;
  spaceName: string;
  artboardName: string;
  layerName: string;
  /** Preset id of the first artboard (default A4). */
  preset?: string;
  ids: IdGenerator;
  /** ISO 8601 timestamp. */
  now: string;
}

/** New document = one Space with one artboard and one layer (specs/04 · regla 1). */
export function createDocument(init: DocumentInit): Document {
  const preset = findPreset(init.preset ?? 'A4') ?? findPreset('A4');
  if (!preset) throw new Error('Missing A4 preset');
  const space = createSpace(init.ids, {
    name: init.spaceName,
    artboards: [createArtboard(init.ids, { name: init.artboardName, w: preset.w, h: preset.h, preset: preset.id })],
    layers: [createLayer(init.ids, init.layerName)],
  });
  return {
    meta: {
      id: init.ids(),
      name: init.name,
      version: CURRENT_FORMAT_VERSION,
      created: init.now,
      modified: init.now,
      units: 'mm',
      colorMode: 'rgb',
    },
    resources: { swatches: [], gradients: [], images: {}, fonts: {}, modifierPresets: [] },
    spaces: [space],
    activeSpaceId: space.id,
  };
}

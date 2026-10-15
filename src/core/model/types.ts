// Document model of specs/02-modelo-de-documento.md and specs/04-espacios-y-mesas.md.
// Pure data (JSON-serialisable, no classes, no undefined-vs-missing games) so Immer patches and
// the .vict format stay trivial. Coordinates are typographic points (pt), Y axis down.

export interface Vec2 {
  x: number;
  y: number;
}

/** Affine 2×3 matrix [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// ── Color and paint ─────────────────────────────────────────────────────────────

export type ColorModel = 'rgb' | 'cmyk' | 'hsb' | 'gray';

export interface Color {
  model: ColorModel;
  values: number[];
  alpha?: number;
}

export type Paint =
  | { type: 'none' }
  | { type: 'solid'; color: Color }
  | { type: 'linear' | 'radial'; gradientId: string; transform: Matrix }
  | { type: 'swatch'; swatchId: string };

export type ArrowId = string;
export type WidthProfileId = string;

export interface StrokeStyle {
  width: number;
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
  miterLimit: number;
  align: 'center' | 'inside' | 'outside';
  dash: number[] | null;
  dashAlignToCorners: boolean;
  startArrow?: ArrowId;
  endArrow?: ArrowId;
  arrowScale: [number, number];
  /** Where arrowheads sit: the tip at the path end (default 'inside') or beyond it ('extend'). */
  arrowAlign?: 'extend' | 'inside';
  profile?: WidthProfileId;
  /** Flips the width profile along the path. */
  profileFlip?: boolean;
}

/** A modifier of the appearance stack (specs/05). `modifierId` names an entry of the registry. */
export interface ModifierInstance {
  id: string;
  modifierId: string;
  enabled: boolean;
  params: { [key: string]: JsonValue };
}

export type AppearanceItem =
  | { kind: 'fill'; paint: Paint; opacity: number; modifiers: ModifierInstance[] }
  | { kind: 'stroke'; paint: Paint; stroke: StrokeStyle; opacity: number; modifiers: ModifierInstance[] }
  | { kind: 'modifier'; mod: ModifierInstance };

export interface Appearance {
  /** Paint order, bottom to top. */
  items: AppearanceItem[];
}

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

// ── Nodes ───────────────────────────────────────────────────────────────────────

export type NodeType = 'path' | 'compound' | 'shape' | 'group' | 'clipGroup' | 'text' | 'image';

export interface BaseNode {
  id: string;
  type: NodeType;
  name?: string;
  visible: boolean;
  locked: boolean;
  /** Applied on top of the local geometry. */
  transform: Matrix;
  appearance: Appearance;
  /** 0..1 */
  opacity: number;
  blendMode: BlendMode;
}

export interface Anchor {
  p: Vec2;
  /** Absolute position of the in handle; null = retracted. */
  in: Vec2 | null;
  out: Vec2 | null;
  kind: 'corner' | 'smooth' | 'asymmetric';
  /** Live-corner widget (Illustrator CC). */
  cornerRadius?: number;
}

export interface PathNode extends BaseNode {
  type: 'path';
  closed: boolean;
  anchors: Anchor[];
}

export interface CompoundNode extends BaseNode {
  type: 'compound';
  children: PathNode[];
  fillRule: 'nonzero' | 'evenodd';
}

export interface RectParams {
  w: number;
  h: number;
  /** top-left, top-right, bottom-right, bottom-left */
  radii: [number, number, number, number];
  cornerType: 'round' | 'inverted' | 'chamfer';
}
export interface EllipseParams {
  w: number;
  h: number;
  /** Degrees; a full ellipse is 0…360 (pie chart as in Illustrator). */
  startAngle: number;
  endAngle: number;
}
export interface PolygonParams {
  radius: number;
  sides: number;
  cornerRadius: number;
}
export interface StarParams {
  r1: number;
  r2: number;
  points: number;
  cornerRadius: number;
}
/** specs/02 leaves it open: a segment from the local origin along +X; rotation lives in `transform`. */
export interface LineParams {
  length: number;
}

export type ShapeKind = 'rect' | 'ellipse' | 'polygon' | 'star' | 'line';

export type ShapeNode = BaseNode & { type: 'shape' } & (
    | { shape: 'rect'; params: RectParams }
    | { shape: 'ellipse'; params: EllipseParams }
    | { shape: 'polygon'; params: PolygonParams }
    | { shape: 'star'; params: StarParams }
    | { shape: 'line'; params: LineParams }
  );

export interface GroupNode extends BaseNode {
  type: 'group';
  children: Node[];
}

/** The first child is the mask. */
export interface ClipGroupNode extends BaseNode {
  type: 'clipGroup';
  children: Node[];
}

/**
 * Attributes of a range of characters (specs/07). Everything after `size` is optional so documents
 * made before it keep opening (no format bump).
 */
export interface TextStyle {
  fontFamily: string;
  fontStyle: string;
  /** pt */
  size: number;
  /** Line spacing in pt; absent = auto (120 % of the size). */
  leading?: number;
  /** Extra space between characters in thousandths of an em. */
  tracking?: number;
  /** Pair kerning: 'auto' (the font's table, default), 'none', or a number of thousandths of an em added to every pair. */
  kerning?: 'auto' | 'none' | number;
  /** Horizontal / vertical scale in percent (default 100). */
  hScale?: number;
  vScale?: number;
  /** Baseline shift in pt, positive raises the text. */
  baselineShift?: number;
  /** Rotation of every character around its own origin, degrees counter-clockwise. */
  charRotation?: number;
  caps?: boolean;
  smallCaps?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  language?: string;
}
export interface TextRun {
  text: string;
  style: TextStyle;
}

export interface ParagraphStyle {
  align?: 'left' | 'center' | 'right' | 'justify' | 'justifyCenter' | 'justifyRight' | 'justifyAll';
  /** pt */
  indentLeft?: number;
  indentRight?: number;
  /** First-line indent in pt (may be negative). */
  indentFirst?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  hyphenate?: boolean;
}

/** A path stored inside a text object: the frame of area text or the line that text on a path follows (local coordinates). */
export interface TextPath {
  anchors: Anchor[];
  closed: boolean;
}

export type PathTextEffect = 'rainbow' | 'skew' | 'ribbon' | 'stair' | 'gravity';

export interface PathTextOptions {
  effect: PathTextEffect;
  /** Which part of the line sits on the path. */
  align: 'ascender' | 'descender' | 'center' | 'baseline';
  /** Extra spacing between characters on sharp curves, pt. */
  spacing: number;
  /** Text on the other side of the path. */
  flip: boolean;
  /** Where the text starts and the limit where it stops, as fractions (0–1) of the path length. */
  start: number;
  end: number;
}

export interface TextNode extends BaseNode {
  type: 'text';
  kind: 'point' | 'area' | 'onPath';
  story: TextRun[];
  /** Style of each paragraph (index = paragraph); missing entries use the defaults. */
  paragraphs?: ParagraphStyle[];
  /** Area text: the shape the text flows in (a rectangle for a dragged box). Absent for point text. */
  frame?: TextPath;
  /** Text on a path: the path it follows. */
  path?: TextPath;
  pathOptions?: PathTextOptions;
  /** Unused since the frame and the path live inside the object; kept so older documents still validate. */
  areaPathId?: string;
  pathRef?: string;
}

export interface ImageNode extends BaseNode {
  type: 'image';
  /** Key into `resources.images`. */
  resourceId: string;
  width: number;
  height: number;
  embedded: boolean;
  linkedPath?: string;
}

export type Node = PathNode | CompoundNode | ShapeNode | GroupNode | ClipGroupNode | TextNode | ImageNode;

// ── Space, artboard, layer ──────────────────────────────────────────────────────

/**
 * A layer holds objects and other layers (sublayers), mixed in one z-ordered list as in Illustrator
 * (specs/02). Groups hold objects only.
 */
export interface Layer {
  type: 'layer';
  id: string;
  name: string;
  /** Layer colour shown in the Layers panel (any CSS colour string, usually #RRGGBB). */
  color: string;
  visible: boolean;
  locked: boolean;
  /** Ctrl+click on the eye of the Layers panel: this layer is shown as outlines only. */
  outline?: boolean;
  /** Index 0 is the bottom of the stack. */
  children: LayerChild[];
}

export type LayerChild = Node | Layer;

export interface Bleed {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Artboard {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bleed: Bleed;
  /** Only affects display and export. */
  background: 'transparent' | Color;
  showCenterMark: boolean;
  showCrossHairs: boolean;
  showVideoSafe: boolean;
  /** 'A4', 'Carta', 'Ícono 24', … (see presets.ts). */
  preset?: string;
}

export interface Guide {
  id: string;
  orientation: 'horizontal' | 'vertical';
  /** pt, in Space coordinates. */
  position: number;
  locked: boolean;
}

export interface SpaceView {
  zoom: number;
  panX: number;
  panY: number;
}

export interface Grid {
  size: number;
  subdivisions: number;
  visible: boolean;
}

export interface Space {
  id: string;
  name: string;
  /** Label colour, #RRGGBB (see SPACE_COLORS). */
  color: string;
  /** Position among the Spaces; kept equal to the array index by the commands. */
  order: number;
  excludeFromExport: boolean;
  /** Canvas colour override (Space properties); null = theme colour. */
  canvasColor: string | null;
  view: SpaceView;
  guides: Guide[];
  grid: Grid;
  artboards: Artboard[];
  layers: Layer[];
}

// ── Document ────────────────────────────────────────────────────────────────────

export type Units = 'px' | 'mm' | 'cm' | 'pt' | 'in';
export type DocumentColorMode = 'rgb' | 'cmyk';

export interface DocumentMeta {
  id: string;
  name: string;
  /** Format version of this document (see io/migrations). */
  version: number;
  /** ISO 8601 */
  created: string;
  modified: string;
  units: Units;
  colorMode: DocumentColorMode;
}

export interface Swatch {
  id: string;
  name: string;
  color: Color;
  /** Global swatches update every object that uses them. */
  global: boolean;
  group?: string;
}

export interface GradientStop {
  /** 0..1 */
  offset: number;
  color: Color;
  opacity: number;
  /** Where the blend between this stop and the next is halfway, 0..1 (default 0.5). Optional: no format bump. */
  midpoint?: number;
}
export interface Gradient {
  id: string;
  name: string;
  type: 'linear' | 'radial';
  stops: GradientStop[];
}

export interface ImageResource {
  width: number;
  height: number;
  format: 'png' | 'jpeg' | 'webp';
}
export interface FontResource {
  family: string;
  style: string;
  /** True when the font file travels inside the .vict. Fonts are resolved by family + style, never by path. */
  embedded: boolean;
}
export interface ModifierPreset {
  id: string;
  name: string;
  stack: ModifierInstance[];
}

export interface Resources {
  swatches: Swatch[];
  gradients: Gradient[];
  /** Keyed by content hash (also the file name inside the .vict). */
  images: { [hash: string]: ImageResource };
  fonts: { [hash: string]: FontResource };
  modifierPresets: ModifierPreset[];
}

export interface Document {
  meta: DocumentMeta;
  resources: Resources;
  spaces: Space[];
  activeSpaceId: string;
}

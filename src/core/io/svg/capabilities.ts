// What a document edited in place as an SVG (specs/02 · Modo SVG) may do. The rule is the round trip: a feature is
// allowed only when `export → import` gives it back unchanged, and the test next to this file proves it. Every
// control that the SVG mode blocks asks `svgBlockReason(gate)` here, so menus, tools, panels and shortcuts share one list.

export type SvgBlockReason =
  /** SVG keeps only point text with plain attributes. */
  | 'text-layout'
  /** SVG stores the final geometry, not the live effect. */
  | 'live-effect'
  /** Shadows, glows and blur are saved as `<filter>`, which the importer drops. */
  | 'filter'
  /** Inside and outside strokes are saved as clip paths, not as strokes. */
  | 'stroke-align'
  /** SVG has one fill and one stroke per element. */
  | 'multiple-paints'
  /** An SVG cannot hide a fill or a stroke without deleting it. */
  | 'hidden-paint'
  /** An SVG is one artboard. */
  | 'single-artboard';

/** Gate id → why it is blocked. Gate ids name what a control does, not the control (13.4 maps controls to gates). */
export const SVG_BLOCKED = {
  'text.area': 'text-layout',
  'text.onPath': 'text-layout',
  'text.advanced': 'text-layout',
  'modifier.live': 'live-effect',
  'blend.live': 'live-effect',
  'stroke.profile': 'live-effect',
  'stroke.arrow': 'live-effect',
  'corner.live': 'live-effect',
  'trace.live': 'live-effect',
  'effect.filter': 'filter',
  'stroke.align': 'stroke-align',
  'appearance.multiple': 'multiple-paints',
  'appearance.hidden': 'hidden-paint',
  'artboard.multiple': 'single-artboard',
  'space.multiple': 'single-artboard',
} as const satisfies Record<string, SvgBlockReason>;

export type SvgGate = keyof typeof SVG_BLOCKED;

export const svgBlockReason = (gate: SvgGate): SvgBlockReason => SVG_BLOCKED[gate];

/**
 * Features that survive the round trip when the SVG is written with `structure: 'semantic'` (the SVG mode's way of saving).
 * The test holds one case per entry and fails if the lists differ.
 */
export const SVG_ROUND_TRIP = [
  'shape.rect',
  'shape.ellipse',
  'path',
  'text.point',
  'compound',
  'group',
  'clip-group',
  'fill.solid',
  'fill.linear',
  'fill.radial',
  'stroke.width',
  'stroke.cap-join',
  'stroke.dash',
  'opacity',
  'blend',
  'transform',
] as const;

export type SvgRoundTripFeature = (typeof SVG_ROUND_TRIP)[number];

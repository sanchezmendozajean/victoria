import type { SubPath } from '../geometry/path';
import type { Color } from '../model/types';
import type { Rect } from '../geometry/rect';
import type { ShapeOp } from '../geometry/booleans';

// Modifiers (specs/05): pure, deterministic functions that take geometry and parameters and return new
// geometry (structural) or a description of how to paint (appearance). Random ones use a stored seed.

/** A list of Bézier contours plus the fill rule: the input and output of structural modifiers. */
export interface Geometry {
  subpaths: SubPath[];
  fillRule: 'nonzero' | 'evenodd';
}

export type ParamValue = number | string | boolean;
export type Params = { [key: string]: ParamValue };

export type ParamUnit = 'length' | 'percent' | 'angle' | 'none';

/** The dialog of a modifier is generated from this list (specs/05 · Diálogo generado por schema). */
export type ParamField =
  | { type: 'number'; key: string; unit: ParamUnit; min?: number; max?: number; step?: number; decimals?: number; slider?: boolean }
  | { type: 'select'; key: string; options: readonly string[] }
  | { type: 'boolean'; key: string }
  | { type: 'color'; key: string };

/** How an appearance modifier changes the way the object is painted. */
export type AppearanceEffect =
  | { type: 'shadow'; color: Color; opacity: number; dx: number; dy: number; blur: number }
  | { type: 'glow'; color: Color; opacity: number; blur: number };

export interface ModifierContext {
  /** Bounds of the geometry being modified. */
  bounds: Rect | null;
  /** The first visible stroke of the object (Outline Stroke, Offset need its width). */
  stroke: { width: number; cap: 'butt' | 'round' | 'square'; join: 'miter' | 'round' | 'bevel'; miterLimit: number } | null;
}

export interface ModifierOutput {
  geometry?: Geometry;
  /** Stroke converted to a filled contour (Outline Stroke): strokes are then painted as fills of this. */
  strokeOutline?: Geometry;
  effect?: AppearanceEffect;
}

export type ModifierCategory = 'path' | 'distort' | 'convert' | 'pathfinder' | 'stylize' | 'warp';

export interface ModifierDef {
  id: string;
  /** Catalog icon id. */
  icon: string;
  category: ModifierCategory;
  affectsGeometry: boolean;
  defaults: Params;
  schema: readonly ParamField[];
  apply(input: Geometry, params: Params, ctx: ModifierContext): ModifierOutput;
  /** Live pathfinder: the modifier acts on the children of a group with this operation instead of on a contour. */
  groupOp?: ShapeOp;
}

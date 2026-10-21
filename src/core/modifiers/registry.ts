import type { ShapeOp } from '../geometry/booleans';
import { puckerBloat, roughen, roundCorners, transformModifier, zigzag } from './distort';
import { offsetPath, outlineStroke } from './offset';
import { dropShadow, outerGlow } from './stylize';
import type { ModifierDef, Params } from './types';
import { warpArc, warpFlag, warpInflate, warpWave } from './warp';

// The modifier registry (specs/05 · Contrato). Adding a modifier is adding an entry here.

const pathfinderModifier = (id: string, icon: string, groupOp: ShapeOp): ModifierDef => ({
  id,
  icon,
  category: 'pathfinder',
  affectsGeometry: true,
  defaults: {},
  schema: [],
  groupOp,
  // Applied by the evaluator on the children of a group; on a lone contour it leaves it as it is.
  apply: (input) => ({ geometry: input }),
});

const DEFS: readonly ModifierDef[] = [
  offsetPath,
  outlineStroke,
  pathfinderModifier('pf-unite', 'pf-unite', 'unite'),
  pathfinderModifier('pf-minus-front', 'pf-minus-front', 'minusFront'),
  pathfinderModifier('pf-intersect', 'pf-intersect', 'intersect'),
  pathfinderModifier('pf-exclude', 'pf-exclude', 'exclude'),
  roundCorners,
  zigzag,
  puckerBloat,
  roughen,
  transformModifier,
  warpArc,
  warpFlag,
  warpWave,
  warpInflate,
  dropShadow,
  outerGlow,
];

const byId = new Map(DEFS.map((d) => [d.id, d]));

export const getModifier = (id: string): ModifierDef | undefined => byId.get(id);
export const listModifiers = (): readonly ModifierDef[] => DEFS;
export const defaultParams = (id: string): Params => ({ ...(byId.get(id)?.defaults ?? {}) });
export const isStructural = (id: string): boolean => byId.get(id)?.affectsGeometry === true;

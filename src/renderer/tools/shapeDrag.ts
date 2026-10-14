import { createEllipse, createLine, createPolygon, createRect, createStar, multiply, rotation, translation, type IdGenerator, type Matrix, type ShapeNode, type Vec2 } from '../../core';
import { constrainTo45 } from './boxGeometry';

export type ShapeToolKind = 'rect' | 'rounded-rect' | 'ellipse' | 'polygon' | 'star' | 'line';

/** What the shape tools remember between drags (Illustrator keeps them per session). */
export interface ShapePrefs {
  /** Corner radius of the rounded rectangle, pt. */
  radius: number;
  sides: number;
  points: number;
  /** Star inner radius / outer radius. */
  ratio: number;
}

export const defaultShapePrefs = (): ShapePrefs => ({ radius: 12, sides: 5, points: 5, ratio: 0.5 });

export interface DragInput {
  kind: ShapeToolKind;
  start: Vec2;
  end: Vec2;
  shift: boolean;
  alt: boolean;
  prefs: ShapePrefs;
}

export type ShapeSpec =
  | { shape: 'rect'; w: number; h: number; radius: number; transform: Matrix }
  | { shape: 'ellipse'; w: number; h: number; transform: Matrix }
  | { shape: 'polygon'; radius: number; sides: number; transform: Matrix }
  | { shape: 'star'; r1: number; r2: number; points: number; transform: Matrix }
  | { shape: 'line'; length: number; transform: Matrix };

const placed = (x: number, y: number, radians: number): Matrix => multiply(translation(x, y), rotation(radians));

/**
 * The shape a drag defines (specs/03 · Formas): corner to corner (Alt from the centre, Shift 1:1) for
 * rectangles and ellipses; from the centre for polygon and star (the drag angle turns them, Shift keeps
 * them upright); start to end for a line (Shift = 45° steps, Alt = start is the centre).
 */
export function shapeFromDrag({ kind, start, end, shift, alt, prefs }: DragInput): ShapeSpec {
  if (kind === 'rect' || kind === 'rounded-rect' || kind === 'ellipse') {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    if (shift) {
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * size;
      dy = Math.sign(dy || 1) * size;
    }
    const x0 = alt ? start.x - Math.abs(dx) : Math.min(start.x, start.x + dx);
    const y0 = alt ? start.y - Math.abs(dy) : Math.min(start.y, start.y + dy);
    const w = alt ? Math.abs(dx) * 2 : Math.abs(dx);
    const h = alt ? Math.abs(dy) * 2 : Math.abs(dy);
    const transform = translation(x0, y0);
    return kind === 'ellipse' ? { shape: 'ellipse', w, h, transform } : { shape: 'rect', w, h, radius: kind === 'rounded-rect' ? prefs.radius : 0, transform };
  }
  if (kind === 'line') {
    const raw = { x: end.x - start.x, y: end.y - start.y };
    const v = shift ? constrainTo45(raw) : raw;
    const length = Math.hypot(v.x, v.y);
    const angle = Math.atan2(v.y, v.x);
    const from = alt ? { x: start.x - v.x, y: start.y - v.y } : start;
    return { shape: 'line', length: alt ? length * 2 : length, transform: placed(from.x, from.y, angle) };
  }
  const v = { x: end.x - start.x, y: end.y - start.y };
  const radius = Math.hypot(v.x, v.y);
  // Vertex 0 sits at -90° (up) in the local space: turn it toward the pointer unless Shift keeps it upright.
  const turn = shift ? 0 : Math.atan2(v.y, v.x) + Math.PI / 2;
  const transform = placed(start.x, start.y, turn);
  return kind === 'polygon'
    ? { shape: 'polygon', radius, sides: prefs.sides, transform }
    : { shape: 'star', r1: radius, r2: radius * prefs.ratio, points: prefs.points, transform };
}

/** Shapes smaller than this on both axes are treated as a click (which opens the exact-size dialog). */
export const isDegenerate = (spec: ShapeSpec): boolean => {
  switch (spec.shape) {
    case 'rect':
    case 'ellipse':
      return spec.w < 1e-6 && spec.h < 1e-6;
    case 'polygon':
      return spec.radius < 1e-6;
    case 'star':
      return spec.r1 < 1e-6;
    case 'line':
      return spec.length < 1e-6;
  }
};

/** The live shape node for a spec (white fill, 1 pt black stroke by default; lines are stroke-only). */
export function buildShape(ids: IdGenerator, spec: ShapeSpec): ShapeNode {
  let node: ShapeNode;
  switch (spec.shape) {
    case 'rect':
      node = createRect(ids, spec.w, spec.h, spec.radius);
      break;
    case 'ellipse':
      node = createEllipse(ids, spec.w, spec.h);
      break;
    case 'polygon':
      node = createPolygon(ids, spec.radius, spec.sides);
      break;
    case 'star':
      node = createStar(ids, spec.r1, spec.r2, spec.points);
      break;
    case 'line':
      node = createLine(ids, spec.length);
      break;
  }
  node.transform = spec.transform;
  return node;
}

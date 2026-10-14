import { orientedBounds, worldRotationOf, type Rect, type Space, type Vec2 } from '../../core';
import { toScreenRect, type HandleId } from './boxGeometry';

/**
 * The selection's bounding box as Illustrator draws it: measured along the axes of the object, so it
 * turns with the object. `rect` lives in the rotated space where the box is axis-aligned
 * (a Space point `p` is `rotate(p, -theta)` there).
 */
export interface OrientedBox {
  rect: Rect;
  theta: number;
}

export const rotatePoint = (p: Vec2, angle: number): Vec2 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

/**
 * Box of the given objects. A single object uses its own rotation; several objects use `fallbackTheta`
 * (0, or the angle they were just rotated by together).
 */
export function orientedBoxOf(space: Space, ids: readonly string[], fallbackTheta = 0): OrientedBox | null {
  if (ids.length === 0) return null;
  const theta = ids.length === 1 ? worldRotationOf(space, ids[0] as string) : fallbackTheta;
  const rect = orientedBounds(space, ids, theta);
  return rect ? { rect, theta } : null;
}

/** Space → rotated box space. */
export const toBoxSpace = (box: OrientedBox, p: Vec2): Vec2 => rotatePoint(p, -box.theta);
/** Rotated box space → Space. */
export const fromBoxSpace = (box: OrientedBox, p: Vec2): Vec2 => rotatePoint(p, box.theta);

/**
 * The box in a screen frame turned back by `theta`, where the usual axis-aligned handle tests apply:
 * hit-test `toBoxScreen(box, screenPoint)` against the returned rectangle.
 */
export function boxScreenRect(box: OrientedBox, view: { zoom: number; panX: number; panY: number }): Rect {
  const pan = rotatePoint({ x: view.panX, y: view.panY }, -box.theta);
  return toScreenRect(box.rect, view.zoom, pan.x, pan.y);
}

export const toBoxScreen = (box: OrientedBox, screen: Vec2): Vec2 => rotatePoint(screen, -box.theta);

const SIDE_ANGLE: Record<HandleId, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };

/** Resize cursor of a handle once the box is turned by `theta`. */
export function cursorForTurnedHandle(handle: HandleId, theta: number): string {
  const degrees = (((SIDE_ANGLE[handle] + (theta * 180) / Math.PI) % 180) + 180) % 180;
  const step = Math.round(degrees / 45) % 4;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][step] as string;
}

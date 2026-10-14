import {
  rectCenter,
  reflectAbout,
  rotateAbout,
  scaleAbout,
  selectionBounds,
  toRadians,
  transformNodesScaling,
  translation,
  type Matrix,
  type Rect,
  type Vec2,
} from '../../core';
import { actionContext, type ActionContext } from './selectionActions';
import { useUi } from './store';

/** Bounds and reference point of the selection, as the X/Y/An/Al fields of the control bar and the Transform panel see them. */
export function selectionFrame(c: ActionContext): { box: Rect; width: number; height: number; point: Vec2 } | null {
  const box = selectionBounds(c.space, c.ids);
  if (!box) return null;
  const ref = useUi.getState().referencePoint;
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  return { box, width, height, point: { x: box.minX + ref.x * width, y: box.minY + ref.y * height } };
}

const run = (c: ActionContext, matrix: Matrix) => c.session.run(transformNodesScaling(c.space.id, c.ids, matrix, useUi.getState().scaleStrokes));

/** X or Y of the reference point, in Space points (`target` is absolute: the artboard origin already added). */
export function moveSelectionTo(axis: 'x' | 'y', target: number): void {
  const c = actionContext();
  const f = c ? selectionFrame(c) : null;
  if (!c || !f) return;
  run(c, axis === 'x' ? translation(target - f.point.x, 0) : translation(0, target - f.point.y));
}

/** Width or height in points, around the reference point; proportional when linked. */
export function resizeSelection(axis: 'x' | 'y', target: number): void {
  const c = actionContext();
  const f = c ? selectionFrame(c) : null;
  if (!c || !f) return;
  const size = axis === 'x' ? f.width : f.height;
  if (size <= 0 || target <= 0) return;
  const factor = target / size;
  const linked = useUi.getState().linkProportions;
  run(c, axis === 'x' ? scaleAbout(factor, linked ? factor : 1, f.point) : scaleAbout(linked ? factor : 1, factor, f.point));
}

/** Rotates the selection by `degrees` counter-clockwise (positive, as in Illustrator) around its centre. */
export function rotateSelection(degrees: number): void {
  const c = actionContext();
  const f = c ? selectionFrame(c) : null;
  if (!c || !f || degrees === 0) return;
  run(c, rotateAbout(toRadians(-degrees), rectCenter(f.box)));
}

/** Slants the selection horizontally by `degrees` (positive leans the top to the right). */
export function shearSelection(degrees: number): void {
  const c = actionContext();
  const f = c ? selectionFrame(c) : null;
  if (!c || !f || degrees === 0) return;
  const t = Math.tan(toRadians(degrees));
  const centre = rectCenter(f.box);
  run(c, [1, 0, -t, 1, t * centre.y, 0]);
}

export function flipSelection(direction: 'h' | 'v'): void {
  const c = actionContext();
  const f = c ? selectionFrame(c) : null;
  if (!c || !f) return;
  run(c, reflectAbout(direction === 'h' ? Math.PI / 2 : 0, rectCenter(f.box)));
}

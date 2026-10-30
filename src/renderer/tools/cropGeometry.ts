import type { CropRect } from '../../core';
import type { HandleId } from './boxGeometry';

/**
 * Pulling a handle of the crop window: the edges the handle touches follow the pointer (given in the image's own
 * units), the others stay; the window never gets thinner than `min`. Clamping to the picture is done by the command.
 */
export function dragCropHandle(handle: HandleId, start: CropRect, point: { x: number; y: number }, min = 1): CropRect {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;
  if (handle.includes('w')) left = Math.min(point.x, right - min);
  if (handle.includes('e')) right = Math.max(point.x, left + min);
  if (handle.includes('n')) top = Math.min(point.y, bottom - min);
  if (handle.includes('s')) bottom = Math.max(point.y, top + min);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

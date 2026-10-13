import type { SpaceView, Vec2 } from '../model/types';
import type { Rect } from '../geometry/rect';

/**
 * The view of a Space: `screen = doc × zoom + pan`, in CSS pixels. At zoom 1 (100 %) one point is one
 * pixel, as in Illustrator on a 72 ppi screen. Pure math: no DOM.
 */
export type Viewport = SpaceView;

/** specs/03 · Zoom: 3 % – 64 000 %. */
export const MIN_ZOOM = 0.03;
export const MAX_ZOOM = 640;

/** Illustrator's zoom ladder, used by Ctrl+/− and the zoom menu. */
export const ZOOM_STEPS: readonly number[] = [
  0.0625, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 128, 256, 512, 640,
];

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

export const docToScreen = (v: Viewport, p: Vec2): Vec2 => ({ x: p.x * v.zoom + v.panX, y: p.y * v.zoom + v.panY });
export const screenToDoc = (v: Viewport, p: Vec2): Vec2 => ({ x: (p.x - v.panX) / v.zoom, y: (p.y - v.panY) / v.zoom });

/** The part of the Space visible in a `width × height` px window. */
export function visibleRect(v: Viewport, width: number, height: number): Rect {
  const a = screenToDoc(v, { x: 0, y: 0 });
  const b = screenToDoc(v, { x: width, y: height });
  return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
}

export const panBy = (v: Viewport, dx: number, dy: number): Viewport => ({ ...v, panX: v.panX + dx, panY: v.panY + dy });

/** Zooms keeping the document point under `anchor` (screen px) where it is: zoom at the cursor. */
export function zoomAt(v: Viewport, newZoom: number, anchor: Vec2): Viewport {
  const zoom = clampZoom(newZoom);
  const doc = screenToDoc(v, anchor);
  return { zoom, panX: anchor.x - doc.x * zoom, panY: anchor.y - doc.y * zoom };
}

/** Next stop of the zoom ladder above (`direction` 1) or below (−1) the current zoom. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const eps = 1e-6;
  if (direction === 1) return ZOOM_STEPS.find((z) => z > zoom * (1 + eps)) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((z) => z < zoom * (1 - eps)) ?? MIN_ZOOM;
}

/** Centres `rect` in the window at the largest zoom that fits it with `padding` px around. */
export function fitRect(width: number, height: number, rect: Rect, padding = 40, maxZoom = MAX_ZOOM): Viewport {
  const w = Math.max(rect.maxX - rect.minX, 1e-6);
  const h = Math.max(rect.maxY - rect.minY, 1e-6);
  const zoom = clampZoom(
    Math.min(maxZoom, Math.max(1e-9, (width - padding * 2) / w), Math.max(1e-9, (height - padding * 2) / h)),
  );
  const cx = (rect.minX + rect.maxX) / 2;
  const cy = (rect.minY + rect.maxY) / 2;
  return { zoom, panX: width / 2 - cx * zoom, panY: height / 2 - cy * zoom };
}

/** Zooms to the rectangle the user dragged (screen px) with the Zoom tool. */
export function zoomToScreenRect(v: Viewport, width: number, height: number, box: Rect): Viewport {
  const a = screenToDoc(v, { x: box.minX, y: box.minY });
  const b = screenToDoc(v, { x: box.maxX, y: box.maxY });
  return fitRect(width, height, { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y }, 0);
}

/** A Space nobody has looked at yet still has the default view and should open fitted. */
export const isUntouchedView = (v: Viewport): boolean => v.zoom === 1 && v.panX === 0 && v.panY === 0;

export const sameView = (a: Viewport, b: Viewport): boolean => a.zoom === b.zoom && a.panX === b.panX && a.panY === b.panY;

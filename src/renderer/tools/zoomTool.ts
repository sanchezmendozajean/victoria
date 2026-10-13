import { stepZoom, zoomAt, zoomToScreenRect, type Rect } from '../../core';
import type { Tool, ToolHost } from './types';

/** Distance in px before a press becomes a marquee instead of a click. */
export const MARQUEE_THRESHOLD = 4;

/** Zoom (Z): click zooms in, Alt+click zooms out, drag a marquee to zoom to it (specs/03). */
export function createZoomTool(): Tool {
  let gesture: { startX: number; startY: number; x: number; y: number; marquee: boolean } | null = null;

  const marqueeRect = (): Rect | null =>
    gesture?.marquee
      ? {
          minX: Math.min(gesture.startX, gesture.x),
          minY: Math.min(gesture.startY, gesture.y),
          maxX: Math.max(gesture.startX, gesture.x),
          maxY: Math.max(gesture.startY, gesture.y),
        }
      : null;

  return {
    id: 'tool-zoom',
    cursor: (altKey) => (altKey ? 'zoom-out' : 'zoom-in'),
    onPointerDown(event) {
      gesture = { startX: event.screen.x, startY: event.screen.y, x: event.screen.x, y: event.screen.y, marquee: false };
    },
    onPointerMove(event, host) {
      if (!gesture) return;
      gesture.x = event.screen.x;
      gesture.y = event.screen.y;
      if (!gesture.marquee && Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) >= MARQUEE_THRESHOLD) gesture.marquee = true;
      if (gesture.marquee) host.invalidateOverlay();
    },
    onPointerUp(event, host) {
      if (!gesture) return;
      const box = marqueeRect();
      if (box && box.maxX - box.minX > 1 && box.maxY - box.minY > 1) {
        host.setView(zoomToScreenRect(host.view, host.size.width, host.size.height, box));
      } else if (!box) {
        const direction = event.altKey ? -1 : 1;
        host.setView(zoomAt(host.view, stepZoom(host.view.zoom, direction), event.screen));
      }
      gesture = null;
      host.invalidateOverlay();
    },
    onKey(key, host: ToolHost) {
      if (key === 'Escape' && gesture) {
        gesture = null;
        host.invalidateOverlay();
      }
    },
    cancel(host) {
      gesture = null;
      host.invalidateOverlay();
    },
    drawOverlay(ctx, _host, theme) {
      const box = marqueeRect();
      if (!box) return;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = theme.accent;
      ctx.fillStyle = theme.accentSoft;
      ctx.fillRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
      ctx.strokeRect(Math.round(box.minX) + 0.5, Math.round(box.minY) + 0.5, box.maxX - box.minX, box.maxY - box.minY);
      ctx.restore();
    },
  };
}

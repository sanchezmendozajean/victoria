import type { Viewport } from '../../core';
import type { CanvasPointerEvent, Tool, ToolHost } from './types';

/** Mano (H, or Space held with any tool): drag to pan. */
export function createHandTool(): Tool {
  let drag: { startX: number; startY: number; view: Viewport } | null = null;

  return {
    id: 'tool-hand',
    cursor: () => (drag ? 'grabbing' : 'grab'),
    onPointerDown(event, host) {
      drag = { startX: event.screen.x, startY: event.screen.y, view: host.view };
    },
    onPointerMove(event: CanvasPointerEvent, host: ToolHost) {
      if (!drag) return;
      host.setView({
        zoom: drag.view.zoom,
        panX: drag.view.panX + event.screen.x - drag.startX,
        panY: drag.view.panY + event.screen.y - drag.startY,
      });
    },
    onPointerUp() {
      drag = null;
    },
    cancel() {
      drag = null;
    },
  };
}

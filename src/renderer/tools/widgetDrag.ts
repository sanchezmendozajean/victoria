import type { Vec2 } from '../../core';
import { anchorToWorld } from '../../core';
import type { CanvasTheme } from '../canvas/theme';
import { cycleCornerType, hostWidgets, widgetAt, widgetCommand, type Widget } from './cornerWidgets';
import { dragged } from './shared';
import type { CanvasPointerEvent, ToolHost } from './types';

/** More selected objects than this and no widgets are shown (they would be unreadable and slow). */
const MAX_OBJECTS_WITH_WIDGETS = 24;

interface Drag {
  widget: Widget;
  key: string;
  screen: Vec2;
  started: boolean;
}

/**
 * The widget gesture shared by Selection and Direct Selection: press a corner (or pie) widget, drag to
 * change its radius or angle as one undo step, Alt+click cycles the corner type of a rectangle.
 */
export function createWidgetDrag(includeAnchors: boolean) {
  let drag: Drag | null = null;

  const widgets = (host: ToolHost): Widget[] => {
    const selection = host.session?.selection;
    if (!selection || selection.ids.length > MAX_OBJECTS_WITH_WIDGETS) return [];
    return hostWidgets(host, includeAnchors);
  };

  return {
    get active(): boolean {
      return drag !== null;
    },

    /** True when the press landed on a widget and the gesture is now ours. */
    press(event: CanvasPointerEvent, host: ToolHost): boolean {
      const widget = widgetAt(widgets(host), event.doc, host.view.zoom);
      if (!widget) return false;
      drag = { widget, key: host.gestureKey(), screen: event.screen, started: false };
      return true;
    },

    move(event: CanvasPointerEvent, host: ToolHost): boolean {
      const d = drag;
      if (!d) return false;
      const { session, space } = host;
      if (!d.started && dragged(event.screen, d.screen)) d.started = true;
      if (d.started && session && space) {
        const command = widgetCommand(space, d.widget, event.doc, event.altKey, d.key);
        if (command) session.run(command);
      }
      host.invalidateOverlay();
      return true;
    },

    release(event: CanvasPointerEvent, host: ToolHost): boolean {
      const d = drag;
      drag = null;
      if (!d) return false;
      const { session, space } = host;
      if (!d.started && event.altKey && session && space) {
        const command = cycleCornerType(space, d.widget);
        if (command) session.run(command);
      }
      host.invalidateOverlay();
      return true;
    },

    cancel(host: ToolHost): void {
      if (drag?.started) host.session?.rollback();
      drag = null;
    },

    /** Cursor to show over a widget (null = not over one). */
    hover(doc: Vec2, host: ToolHost): boolean {
      return !drag && widgetAt(widgets(host), doc, host.view.zoom) !== null;
    },

    draw(ctx: CanvasRenderingContext2D, host: ToolHost, theme: CanvasTheme): void {
      const view = host.view;
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = theme.accent;
      for (const w of widgets(host)) {
        const p = { x: w.pos.x * view.zoom + view.panX, y: w.pos.y * view.zoom + view.panY };
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = w.kind === 'pie' ? theme.accent : '#ffffff';
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      void anchorToWorld;
    },
  };
}

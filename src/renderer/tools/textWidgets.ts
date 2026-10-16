import {
  applyToPoint,
  convertTextKind,
  frameOf,
  projectOnSubPath,
  samplerOf,
  setPathTextOptions,
  textGeometry,
  worldToLocal,
  type Matrix,
  type PathTextOptions,
  type TextNode,
  type Vec2,
} from '../../core';
import type { CanvasTheme } from '../canvas/theme';
import { dragged, selectedTopLevel } from './shared';
import { fractionAlong } from './textTool';
import type { CanvasPointerEvent, ToolHost } from './types';

// Widgets of the selected text object (specs/07): the three brackets of text on a path (start, end and the
// centre one that slides the text and flips it when dragged across the path) and the circle that
// converts point text to area text and back (double click).

const PICK_PX = 7;
/** Distance (screen px) from the path that flips the text when the centre bracket is dragged across. */
const FLIP_PX = 6;
const MIN_SPAN = 0.001;

export type TextWidget =
  | { kind: 'bracket'; part: 'start' | 'end' | 'center'; node: TextNode; world: Matrix; pos: Vec2; angle: number }
  | { kind: 'convert'; node: TextNode; world: Matrix; pos: Vec2 };

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** The widgets of the one selected text object (none for other selections). */
export function textWidgetsOf(host: ToolHost): TextWidget[] {
  const space = host.space;
  if (!space) return [];
  const ids = selectedTopLevel(host);
  if (ids.length !== 1) return [];
  const frame = frameOf(space, ids[0] as string);
  if (!frame || frame.node.type !== 'text') return [];
  const node = frame.node;

  if (node.kind === 'onPath' && node.path && node.pathOptions) {
    const sampler = samplerOf(node.path, node.pathOptions.flip);
    if (sampler.length === 0) return [];
    const at = (f: number) => sampler.at(Math.max(0, Math.min(1, f)) * sampler.length);
    const o = node.pathOptions;
    const parts: Array<['start' | 'end' | 'center', number]> = [
      ['start', o.start],
      ['end', o.end],
      ['center', (o.start + o.end) / 2],
    ];
    return parts.map(([part, f]) => {
      const s = at(f);
      return { kind: 'bracket', part, node, world: frame.world, pos: applyToPoint(frame.world, s.point), angle: s.angle };
    });
  }

  if (node.kind === 'point' || node.kind === 'area') {
    const bounds = textGeometry(node).bounds;
    if (!bounds) return [];
    const offset = 12 / host.view.zoom;
    const local = { x: bounds.maxX + offset, y: (bounds.minY + bounds.maxY) / 2 };
    return [{ kind: 'convert', node, world: frame.world, pos: applyToPoint(frame.world, local) }];
  }
  return [];
}

export function textWidgetAt(widgets: readonly TextWidget[], doc: Vec2, zoom: number): TextWidget | null {
  let best: TextWidget | null = null;
  let bestDistance = PICK_PX / zoom;
  for (const w of widgets) {
    const d = dist(w.pos, doc);
    if (d <= bestDistance) {
      best = w;
      bestDistance = d;
    }
  }
  return best;
}

interface Drag {
  widget: Extract<TextWidget, { kind: 'bracket' }>;
  key: string;
  screen: Vec2;
  started: boolean;
  /** Fraction under the pointer when the gesture began (centre bracket: how far the text slid). */
  grabbed: number;
  startOptions: PathTextOptions;
}

/** Fraction (0..1, along the text direction) of the point of the path nearest to a document point, and which side of the path it is on. */
function projectFraction(node: TextNode, world: Matrix, doc: Vec2): { fraction: number; side: number; distance: number } | null {
  if (!node.path || !node.pathOptions) return null;
  const local = worldToLocal(world, doc);
  const projection = projectOnSubPath({ anchors: node.path.anchors, closed: node.path.closed }, local);
  if (!projection) return null;
  const forward = fractionAlong(node.path.anchors, node.path.closed, projection.segmentIndex, projection.t);
  const fraction = node.pathOptions.flip ? 1 - forward : forward;
  const sampler = samplerOf(node.path, node.pathOptions.flip);
  const on = sampler.at(fraction * sampler.length);
  // Cross product of the direction of travel and the pointer: negative = on the side the text sits (not flipped).
  const side = Math.cos(on.angle) * (local.y - on.point.y) - Math.sin(on.angle) * (local.x - on.point.x);
  return { fraction, side, distance: projection.distance };
}

export function createTextWidgets() {
  let drag: Drag | null = null;

  return {
    get active(): boolean {
      return drag !== null;
    },

    press(event: CanvasPointerEvent, host: ToolHost): boolean {
      const widget = textWidgetAt(textWidgetsOf(host), event.doc, host.view.zoom);
      if (!widget || widget.kind !== 'bracket' || !widget.node.pathOptions) return false;
      const hit = projectFraction(widget.node, widget.world, event.doc);
      drag = { widget, key: host.gestureKey(), screen: event.screen, started: false, grabbed: hit?.fraction ?? 0, startOptions: { ...widget.node.pathOptions } };
      return true;
    },

    move(event: CanvasPointerEvent, host: ToolHost): boolean {
      const d = drag;
      if (!d) return false;
      if (!d.started && dragged(event.screen, d.screen)) d.started = true;
      const session = host.session;
      const space = host.space;
      if (d.started && session && space) {
        const hit = projectFraction(d.widget.node, d.widget.world, event.doc);
        if (hit) {
          const o = d.startOptions;
          const patch: Partial<PathTextOptions> = {};
          if (d.widget.part === 'start') patch.start = Math.max(0, Math.min(o.end - MIN_SPAN, hit.fraction));
          else if (d.widget.part === 'end') patch.end = Math.min(1, Math.max(o.start + MIN_SPAN, hit.fraction));
          else {
            // Slide the text keeping its span (measured in the orientation the gesture began in). Crossing to the
            // other side of the path flips it; the same stretch of path is then measured from its other end.
            const span = o.end - o.start;
            const start = Math.max(0, Math.min(1 - span, o.start + (hit.fraction - d.grabbed)));
            const flip = hit.distance * host.view.zoom > FLIP_PX ? (hit.side > 0 ? !o.flip : o.flip) : o.flip;
            if (flip === o.flip) {
              patch.start = start;
              patch.end = start + span;
            } else {
              patch.flip = flip;
              patch.start = 1 - (start + span);
              patch.end = 1 - start;
            }
          }
          session.run(setPathTextOptions(space.id, d.widget.node.id, patch, d.key));
        }
      }
      host.invalidateOverlay();
      return true;
    },

    release(_event: CanvasPointerEvent, host: ToolHost): boolean {
      if (!drag) return false;
      drag = null;
      host.invalidateOverlay();
      return true;
    },

    cancel(host: ToolHost): void {
      if (drag?.started) host.session?.rollback();
      drag = null;
    },

    hover(doc: Vec2, host: ToolHost): boolean {
      return !drag && textWidgetAt(textWidgetsOf(host), doc, host.view.zoom) !== null;
    },

    /** Double click on the convert circle: point text ↔ area text. True when it was on the circle. */
    doubleClick(event: CanvasPointerEvent, host: ToolHost): boolean {
      const widget = textWidgetAt(textWidgetsOf(host), event.doc, host.view.zoom);
      const space = host.space;
      if (!widget || widget.kind !== 'convert' || !host.session || !space) return false;
      host.session.run(convertTextKind(space.id, widget.node.id, widget.node.kind === 'area' ? 'point' : 'area'));
      host.invalidateOverlay();
      return true;
    },

    draw(ctx: CanvasRenderingContext2D, host: ToolHost, theme: CanvasTheme): void {
      const view = host.view;
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = theme.accent;
      for (const w of textWidgetsOf(host)) {
        const p = { x: w.pos.x * view.zoom + view.panX, y: w.pos.y * view.zoom + view.panY };
        if (w.kind === 'convert') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = w.node.kind === 'area' ? theme.accent : '#ffffff';
          ctx.fill();
          ctx.stroke();
          continue;
        }
        // Brackets stand across the path; the centre one is a diamond.
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(w.angle);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        if (w.part === 'center') {
          ctx.moveTo(0, -5);
          ctx.lineTo(5, 0);
          ctx.lineTo(0, 5);
          ctx.lineTo(-5, 0);
          ctx.closePath();
          ctx.fill();
        } else {
          const dir = w.part === 'start' ? 1 : -1;
          ctx.moveTo(dir * 5, -8);
          ctx.lineTo(0, -8);
          ctx.lineTo(0, 8);
          ctx.lineTo(dir * 5, 8);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    },
  };
}

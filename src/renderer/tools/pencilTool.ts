import {
  addNode,
  closeOpenPath,
  createPath,
  fitCurve,
  joinPaths,
  joinPathNodes,
  selectOnly,
  type Anchor,
  type Vec2,
} from '../../core';
import { endpointAt, toLocalPoint } from './pathHits';
import type { EndpointHit } from './pathHits';
import { dragged, withLook } from './shared';
import type { Tool } from './types';

/** Maximum deviation of the fitted curve from the freehand stroke, in screen pixels ("Fidelity" 2.5 px of Illustrator). */
export const PENCIL_FIDELITY_PX = 2.5;
/** The stroke closes when it ends this close (screen px) to where it started. */
export const PENCIL_CLOSE_PX = 8;
/** Raw samples closer than this (screen px) to the previous one are dropped. */
const MIN_SAMPLE_PX = 1.5;

interface Stroke {
  points: Vec2[];
  screen: Vec2;
  last: Vec2;
  started: boolean;
  from: EndpointHit | null;
}

/**
 * Pencil (N): freehand stroke fitted with Schneider's algorithm into few Bézier anchors. A stroke that
 * ends on its start closes (Alt forces closing); one that starts on the end of an open path continues
 * it, and ending on another open end joins them (specs/03 · Lápiz).
 */
export function createPencilTool(): Tool {
  let stroke: Stroke | null = null;

  return {
    id: 'tool-pencil',
    cursor: () => 'crosshair',

    onPointerDown(event, host) {
      if (event.button !== 0 || !host.session) return;
      stroke = { points: [event.doc], screen: event.screen, last: event.screen, started: false, from: endpointAt(host, event.doc) };
    },

    onPointerMove(event, host) {
      const s = stroke;
      if (!s) return;
      if (!s.started && dragged(event.screen, s.screen)) s.started = true;
      if (!s.started) return;
      if (Math.hypot(event.screen.x - s.last.x, event.screen.y - s.last.y) < MIN_SAMPLE_PX) return;
      s.points.push(event.doc);
      s.last = event.screen;
      host.invalidateOverlay();
    },

    onPointerUp(event, host) {
      const s = stroke;
      stroke = null;
      host.invalidateOverlay();
      const { session, space } = host;
      if (!s || !s.started || !session || !space) return;
      const points = [...s.points, event.doc];
      const zoom = host.view.zoom;
      const first = points[0] as Vec2;
      const lastPoint = points[points.length - 1] as Vec2;
      const nearStart = Math.hypot(lastPoint.x - first.x, lastPoint.y - first.y) * zoom < PENCIL_CLOSE_PX;
      const close = !s.from && points.length > 3 && (nearStart || event.altKey);
      if (close) points[points.length - 1] = first;

      if (s.from) {
        // Continue the path the stroke started on: the stroke's first point is the end it grows from.
        const f = s.from.frame;
        const own = f.path.anchors;
        const endAnchor = (s.from.end === 'end' ? own[own.length - 1] : own[0]) as Anchor;
        const local = points.map((p) => toLocalPoint(f.world, p));
        local[0] = endAnchor.p;
        const grown = fitCurve(local, PENCIL_FIDELITY_PX / zoom / (Math.sqrt(Math.abs(f.world[0] * f.world[3] - f.world[1] * f.world[2])) || 1));
        if (grown.length < 2) return;
        let joined = joinPaths(own, s.from.end, grown, 'start');
        const removed: string[] = [];
        // Ending on another open path joins them too.
        const tail = endpointAt(host, lastPoint, f.path.id);
        if (tail) {
          joined = joinPaths(joined, 'end', tail.frame.path.anchors, tail.end);
          removed.push(tail.frame.path.id);
        }
        session.run(joinPathNodes(space.id, f.path.id, removed, joined, false), selectOnly(space.id, [f.path.id]));
        return;
      }

      let anchors: Anchor[] = fitCurve(points, PENCIL_FIDELITY_PX / zoom);
      if (anchors.length < 2) return;
      const layerId = host.activeLayerId;
      if (!layerId) return;
      if (close) anchors = closeOpenPath(anchors);
      const node = withLook(createPath(session.ids, anchors, close), host);
      session.run(addNode(space.id, layerId, node), selectOnly(space.id, [node.id]));
    },

    onKey(key, host) {
      if (key === 'Escape' && stroke) {
        stroke = null;
        host.invalidateOverlay();
      }
    },

    cancel(host) {
      stroke = null;
      host.invalidateOverlay();
    },

    drawOverlay(ctx, host, theme) {
      const s = stroke;
      if (!s || !s.started) return;
      const view = host.view;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = theme.accent;
      ctx.beginPath();
      s.points.forEach((p, i) => {
        const x = p.x * view.zoom + view.panX;
        const y = p.y * view.zoom + view.panY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    },
  };
}

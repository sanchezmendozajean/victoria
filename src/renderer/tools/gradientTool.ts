import {
  applyGradient,
  colorToCss,
  defaultGradientFor,
  defaultGradientTransform,
  editGradients,
  frameOf,
  geometryBounds,
  gradientAxis,
  gradientColorAt,
  gradientTransform,
  nodeGeometry,
  paintTargets,
  primaryItem,
  setGradientTransform,
  sortStops,
  worldToLocal,
  type Gradient,
  type Matrix,
  type Node,
  type Paint,
  type Vec2,
} from '../../core';
import { constrainTo45 } from './boxGeometry';
import { currentSelection, dragged, topLevelIds } from './shared';
import type { CanvasPointerEvent, Tool, ToolHost } from './types';

type GradientPaint = Extract<Paint, { type: 'linear' | 'radial' }>;

const HIT_PX = 6;
/** How far (screen px) the stop markers hang from the axis. */
const STOP_HANG_PX = 14;

interface Annotator {
  node: Node;
  world: Matrix;
  paint: GradientPaint;
  gradient: Gradient;
  /** World-space axis. */
  start: Vec2;
  end: Vec2;
  /** World point of the aspect handle (radial). */
  aspectPoint: Vec2 | null;
  aspect: number;
}

const apply = (m: Matrix, p: Vec2): Vec2 => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

type State =
  | { kind: 'idle' }
  | { kind: 'define'; start: Vec2; screen: Vec2; key: string; created: boolean }
  | { kind: 'handle'; handle: 'origin' | 'end' | 'aspect' | 'stop' | 'mid'; index: number; key: string; pointer: Vec2; start: Vec2; end: Vec2; started: boolean; screen: Vec2 };

/**
 * Gradient tool (G): drag over the selection to set the direction and length of its gradient (giving it
 * one if it has none); the annotator on the object moves the origin, the end, the stops and midpoints
 * and adds stops with a click (specs/03 · Degradado).
 */
export function createGradientTool(): Tool {
  let state: State = { kind: 'idle' };

  const leaves = (host: ToolHost): Node[] => {
    const selection = currentSelection(host);
    return selection && host.space ? paintTargets(host.space, topLevelIds(host.space, selection.ids)) : [];
  };

  function annotator(host: ToolHost): Annotator | null {
    const space = host.space;
    const nodes = leaves(host);
    const node = nodes.length === 1 ? nodes[0] : undefined;
    if (!space || !node) return null;
    const paint = primaryItem(node.appearance, host.activePaint)?.paint;
    if (!paint || (paint.type !== 'linear' && paint.type !== 'radial')) return null;
    const gradient = host.session?.document.resources.gradients.find((g) => g.id === paint.gradientId);
    const frame = frameOf(space, node.id);
    if (!gradient || !frame) return null;
    const axis = gradientAxis(paint.transform);
    const m = paint.transform;
    const second = apply(frame.world, { x: m[4] + m[2], y: m[5] + m[3] });
    return {
      node,
      world: frame.world,
      paint,
      gradient,
      start: apply(frame.world, axis.start),
      end: apply(frame.world, axis.end),
      aspectPoint: paint.type === 'radial' ? second : null,
      aspect: axis.aspect,
    };
  }

  const screenOf = (host: ToolHost, p: Vec2): Vec2 => ({ x: p.x * host.view.zoom + host.view.panX, y: p.y * host.view.zoom + host.view.panY });
  const near = (host: ToolHost, a: Vec2, b: Vec2, px = HIT_PX) => {
    const sa = screenOf(host, a);
    const sb = screenOf(host, b);
    return Math.hypot(sa.x - sb.x, sa.y - sb.y) <= px;
  };
  const onAxis = (a: Annotator, offset: number): Vec2 => ({ x: a.start.x + (a.end.x - a.start.x) * offset, y: a.start.y + (a.end.y - a.start.y) * offset });
  /** Where the marker of a stop is drawn and grabbed: beside the axis, so it never covers the ends. */
  const stopPoint = (host: ToolHost, a: Annotator, offset: number): Vec2 => {
    const p = onAxis(a, offset);
    const vx = a.end.x - a.start.x;
    const vy = a.end.y - a.start.y;
    const l = Math.hypot(vx, vy) || 1;
    const hang = STOP_HANG_PX / host.view.zoom;
    return { x: p.x - (vy / l) * hang, y: p.y + (vx / l) * hang };
  };
  const offsetOf = (a: Annotator, p: Vec2): number => {
    const vx = a.end.x - a.start.x;
    const vy = a.end.y - a.start.y;
    const l2 = vx * vx + vy * vy;
    return l2 === 0 ? 0 : ((p.x - a.start.x) * vx + (p.y - a.start.y) * vy) / l2;
  };

  /** Writes the axis `start`→`end` (world) into the gradient transform of every selected leaf that has a gradient. */
  function setAxis(host: ToolHost, start: Vec2, end: Vec2, key: string, aspect?: number): void {
    const { session, space } = host;
    if (!session || !space) return;
    const selection = currentSelection(host);
    if (!selection) return;
    const transforms = new Map<string, Matrix>();
    for (const node of leaves(host)) {
      const frame = frameOf(space, node.id);
      const paint = primaryItem(node.appearance, host.activePaint)?.paint;
      if (!frame || !paint || (paint.type !== 'linear' && paint.type !== 'radial')) continue;
      transforms.set(node.id, gradientTransform(worldToLocal(frame.world, start), worldToLocal(frame.world, end), aspect ?? gradientAxis(paint.transform).aspect));
    }
    if (transforms.size > 0) session.run(setGradientTransform(space.id, selection.ids, host.activePaint, transforms, undefined, key));
  }

  /** Gives the objects without a gradient one running `start`→`end`, and re-aims the others. */
  function define(host: ToolHost, start: Vec2, end: Vec2, key: string): void {
    const { session, space } = host;
    const selection = currentSelection(host);
    if (!session || !space || !selection) return;
    const missing: Node[] = [];
    for (const node of leaves(host)) {
      const paint = primaryItem(node.appearance, host.activePaint)?.paint;
      if (!paint || (paint.type !== 'linear' && paint.type !== 'radial')) missing.push(node);
    }
    if (missing.length > 0) {
      const first = missing[0] as Node;
      const base = primaryItem(first.appearance, host.activePaint)?.paint;
      const gradient = defaultGradientFor(session.ids, 'linear', base?.type === 'solid' ? base.color : null);
      const transforms = new Map<string, Matrix>();
      for (const node of missing) {
        const frame = frameOf(space, node.id);
        if (frame) transforms.set(node.id, gradientTransform(worldToLocal(frame.world, start), worldToLocal(frame.world, end), 1));
      }
      session.run(applyGradient(space.id, missing.map((n) => n.id), host.activePaint, { type: 'linear', gradient, transform: [1, 0, 0, 1, 0, 0] }, transforms, key));
    }
    setAxis(host, start, end, key);
  }

  return {
    id: 'tool-gradient',
    cursor: () => 'crosshair',

    onPointerDown(event: CanvasPointerEvent, host) {
      const { session, space } = host;
      if (event.button !== 0 || !session || !space) return;
      const a = annotator(host);
      if (a) {
        const key = host.gestureKey();
        const mk = (handle: 'origin' | 'end' | 'aspect' | 'stop' | 'mid', index = 0): State => ({ kind: 'handle', handle, index, key, pointer: event.doc, start: a.start, end: a.end, started: false, screen: event.screen });
        const stops = sortStops(a.gradient.stops);
        for (let i = 0; i < stops.length; i++) {
          if (near(host, event.doc, stopPoint(host, a, (stops[i] as { offset: number }).offset))) {
            if (event.clickCount >= 2 && stops.length > 2) {
              session.run(editGradients(space.id, [a.node.id], host.activePaint, (g) => void (g.stops = sortStops(g.stops).filter((_, j) => j !== i)), session.ids, key));
              return;
            }
            state = mk('stop', i);
            return;
          }
        }
        for (let i = 0; i < stops.length - 1; i++) {
          const s = stops[i] as { offset: number; midpoint?: number };
          const n = stops[i + 1] as { offset: number };
          if (near(host, event.doc, stopPoint(host, a, s.offset + (n.offset - s.offset) * (s.midpoint ?? 0.5)), 5)) {
            state = mk('mid', i);
            return;
          }
        }
        if (near(host, event.doc, a.end)) return void (state = mk('end'));
        if (a.aspectPoint && near(host, event.doc, a.aspectPoint)) return void (state = mk('aspect'));
        if (near(host, event.doc, a.start)) return void (state = mk('origin'));
        // A click on the axis adds a stop there.
        const offset = offsetOf(a, event.doc);
        const onLine = offset > 0 && offset < 1 && near(host, event.doc, onAxis(a, offset), 5);
        if (onLine) {
          const { color, opacity } = gradientColorAt(stops, offset);
          session.run(
            editGradients(
              space.id,
              [a.node.id],
              host.activePaint,
              (g) => {
                g.stops.push({ offset, color, opacity });
                g.stops = sortStops(g.stops);
              },
              session.ids,
              key,
            ),
          );
          return;
        }
      }
      if (leaves(host).length === 0) return;
      state = { kind: 'define', start: event.doc, screen: event.screen, key: host.gestureKey(), created: false };
    },

    onPointerMove(event, host) {
      const s = state;
      if (s.kind === 'define') {
        if (!dragged(event.screen, s.screen)) return;
        let end = event.doc;
        if (event.shiftKey) {
          const d = constrainTo45({ x: end.x - s.start.x, y: end.y - s.start.y });
          end = { x: s.start.x + d.x, y: s.start.y + d.y };
        }
        s.created = true;
        define(host, s.start, end, s.key);
        host.invalidateOverlay();
        return;
      }
      if (s.kind !== 'handle') {
        host.invalidateOverlay();
        return;
      }
      if (!s.started && !dragged(event.screen, s.screen)) return;
      s.started = true;
      const a = annotator(host);
      const { session, space } = host;
      if (!a || !session || !space) return;
      if (s.handle === 'origin') {
        const d = { x: event.doc.x - s.pointer.x, y: event.doc.y - s.pointer.y };
        setAxis(host, { x: s.start.x + d.x, y: s.start.y + d.y }, { x: s.end.x + d.x, y: s.end.y + d.y }, s.key);
      } else if (s.handle === 'end') {
        let end = event.doc;
        if (event.shiftKey) {
          const d = constrainTo45({ x: end.x - s.start.x, y: end.y - s.start.y });
          end = { x: s.start.x + d.x, y: s.start.y + d.y };
        }
        setAxis(host, s.start, end, s.key);
      } else if (s.handle === 'aspect') {
        const vx = s.end.x - s.start.x;
        const vy = s.end.y - s.start.y;
        const length = Math.hypot(vx, vy) || 1;
        const perp = { x: -vy / length, y: vx / length };
        const comp = (event.doc.x - s.start.x) * perp.x + (event.doc.y - s.start.y) * perp.y;
        setAxis(host, s.start, s.end, s.key, Math.max(0.01, Math.abs(comp) / length));
      } else if (s.handle === 'stop') {
        const offset = Math.min(1, Math.max(0, offsetOf(a, event.doc)));
        const i = s.index;
        session.run(
          editGradients(
            space.id,
            [a.node.id],
            host.activePaint,
            (g) => {
              const sorted = sortStops(g.stops);
              if (sorted[i]) sorted[i].offset = Math.round(offset * 1000) / 1000;
              g.stops = sortStops(sorted);
            },
            session.ids,
            s.key,
          ),
        );
      } else {
        const stops = sortStops(a.gradient.stops);
        const lo = stops[s.index];
        const hi = stops[s.index + 1];
        if (!lo || !hi) return;
        const mid = Math.min(0.95, Math.max(0.05, (offsetOf(a, event.doc) - lo.offset) / (hi.offset - lo.offset || 1)));
        const i = s.index;
        session.run(
          editGradients(
            space.id,
            [a.node.id],
            host.activePaint,
            (g) => {
              const sorted = sortStops(g.stops);
              if (sorted[i]) sorted[i].midpoint = Math.round(mid * 1000) / 1000;
              g.stops = sortStops(sorted);
            },
            session.ids,
            s.key,
          ),
        );
      }
      host.invalidateOverlay();
    },

    onPointerUp(event, host) {
      const s = state;
      state = { kind: 'idle' };
      const { session, space } = host;
      if (!session || !space) return;
      if (s.kind === 'define' && !s.created) {
        // A plain click gives objects without a gradient one that fills their bounds.
        const missing = leaves(host).filter((n) => {
          const p = primaryItem(n.appearance, host.activePaint)?.paint;
          return !p || (p.type !== 'linear' && p.type !== 'radial');
        });
        if (missing.length > 0) {
          const base = primaryItem((missing[0] as Node).appearance, host.activePaint)?.paint;
          const gradient = defaultGradientFor(session.ids, 'linear', base?.type === 'solid' ? base.color : null);
          const transforms = new Map<string, Matrix>();
          for (const node of missing) {
            const g = nodeGeometry(node);
            const bounds = g ? geometryBounds(g) : null;
            if (bounds) transforms.set(node.id, defaultGradientTransform(bounds, 'linear', 0));
          }
          session.run(applyGradient(space.id, missing.map((n) => n.id), host.activePaint, { type: 'linear', gradient, transform: [1, 0, 0, 1, 0, 0] }, transforms));
        }
      }
      void event;
      host.invalidateOverlay();
    },

    onKey(key, host) {
      if (key !== 'Escape') return;
      if ((state.kind === 'define' && state.created) || (state.kind === 'handle' && state.started)) host.session?.rollback();
      state = { kind: 'idle' };
      host.invalidateOverlay();
    },

    cancel(host) {
      if ((state.kind === 'define' && state.created) || (state.kind === 'handle' && state.started)) host.session?.rollback();
      state = { kind: 'idle' };
    },

    drawOverlay(ctx, host, theme) {
      const a = annotator(host);
      if (!a) return;
      const s0 = screenOf(host, a.start);
      const s1 = screenOf(host, a.end);
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = theme.accent;
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.stroke();
      if (a.aspectPoint) {
        const sp = screenOf(host, a.aspectPoint);
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(sp.x, sp.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // Origin (hollow circle) and end (square).
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s0.x, s0.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(Math.round(s1.x) - 3.5, Math.round(s1.y) - 3.5, 7, 7);
      ctx.strokeRect(Math.round(s1.x) - 3.5, Math.round(s1.y) - 3.5, 7, 7);
      // Stops and midpoints.
      const stops = sortStops(a.gradient.stops);
      stops.forEach((stop, i) => {
        const p = screenOf(host, stopPoint(host, a, stop.offset));
        const onLineScreen = screenOf(host, onAxis(a, stop.offset));
        ctx.beginPath();
        ctx.moveTo(onLineScreen.x, onLineScreen.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.fillStyle = colorToCss(stop.color);
        ctx.fillRect(Math.round(p.x) - 4.5, Math.round(p.y) - 4.5, 9, 9);
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(Math.round(p.x) - 4.5, Math.round(p.y) - 4.5, 9, 9);
        ctx.strokeStyle = theme.accent;
        const next = stops[i + 1];
        if (next) {
          const m = screenOf(host, onAxis(a, stop.offset + (next.offset - stop.offset) * (stop.midpoint ?? 0.5)));
          ctx.beginPath();
          ctx.moveTo(m.x, m.y - 4);
          ctx.lineTo(m.x + 4, m.y);
          ctx.lineTo(m.x, m.y + 4);
          ctx.lineTo(m.x - 4, m.y);
          ctx.closePath();
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.stroke();
        }
      });
      ctx.restore();
    },
  };
}

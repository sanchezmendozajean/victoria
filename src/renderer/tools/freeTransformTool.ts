import {
  distortNodes,
  isDistortable,
  locateNode,
  quadMapper,
  rectQuad,
  replaceNodes,
  transformNodesScaling,
  type Matrix,
  type Node,
  type Quad,
  type Rect,
  type Space,
  type Vec2,
} from '../../core';
import { t } from '../i18n';
import { constrainTo45, cursorForHandle, handleAt, toScreenRect, type HandleId } from './boxGeometry';
import { dragQuad, skewFromHandle, type FreeTransformMode } from './freeTransformGeometry';
import { boxScreenRect, orientedBoxOf, toBoxScreen, toBoxSpace, type OrientedBox } from './orientedBox';
import { createSelectionTool } from './selectionTool';
import { boxOf, dragged, selectedTopLevel, stepBetween } from './shared';
import type { CanvasPointerEvent, Tool, ToolHost } from './types';

/** Remembered between uses, like the other tool preferences (Illustrator keeps the widget mode). */
let currentMode: FreeTransformMode = 'free';
export const freeTransformMode = (): FreeTransformMode => currentMode;
export const setFreeTransformMode = (mode: FreeTransformMode): void => {
  currentMode = mode;
};

const MODES: readonly FreeTransformMode[] = ['constrain', 'free', 'perspective', 'distort'];
const BUTTON = 22;
const GAP = 4;

type Gesture =
  | { kind: 'widget' }
  | { kind: 'delegate'; forceShift: boolean }
  | { kind: 'quad'; mode: 'distort' | 'perspective'; handle: HandleId; rect: Rect; ids: string[]; frozen: Space; key: string; start: Vec2; screen: Vec2; started: boolean; quad: Quad }
  | { kind: 'skew'; handle: HandleId; box: OrientedBox; ids: string[]; key: string; start: Vec2; screen: Vec2; started: boolean; applied: Matrix };

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Where the four mode buttons sit: a column to the right of the selection's box, in screen pixels. */
function widgetRects(host: ToolHost, bounds: Rect): Array<{ mode: FreeTransformMode; x: number; y: number }> {
  const s = toScreenRect(bounds, host.view.zoom, host.view.panX, host.view.panY);
  return MODES.map((mode, i) => ({ mode, x: s.maxX + 16, y: s.minY + i * (BUTTON + GAP) }));
}

function widgetAt(host: ToolHost, bounds: Rect, screen: Vec2): FreeTransformMode | null {
  for (const b of widgetRects(host, bounds)) {
    if (screen.x >= b.x && screen.x <= b.x + BUTTON && screen.y >= b.y && screen.y <= b.y + BUTTON) return b.mode;
  }
  return null;
}

function drawGlyph(ctx: CanvasRenderingContext2D, mode: FreeTransformMode, x: number, y: number, color: string): void {
  const c = { x: x + BUTTON / 2, y: y + BUTTON / 2 };
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (mode === 'constrain') {
    ctx.rect(c.x - 5, c.y - 5, 10, 10);
    ctx.moveTo(c.x - 5, c.y + 5);
    ctx.lineTo(c.x + 5, c.y - 5);
    ctx.stroke();
  } else if (mode === 'free') {
    ctx.rect(c.x - 5, c.y - 5, 10, 10);
    ctx.stroke();
    for (const [dx, dy] of [[-5, -5], [5, -5], [5, 5], [-5, 5]] as const) ctx.fillRect(c.x + dx - 1.5, c.y + dy - 1.5, 3, 3);
  } else if (mode === 'perspective') {
    ctx.moveTo(c.x - 2.5, c.y - 5);
    ctx.lineTo(c.x + 2.5, c.y - 5);
    ctx.lineTo(c.x + 6, c.y + 5);
    ctx.lineTo(c.x - 6, c.y + 5);
    ctx.closePath();
    ctx.stroke();
  } else {
    ctx.moveTo(c.x - 4, c.y - 6);
    ctx.lineTo(c.x + 6, c.y - 3);
    ctx.lineTo(c.x + 3, c.y + 6);
    ctx.lineTo(c.x - 6, c.y + 4);
    ctx.closePath();
    ctx.stroke();
    for (const [dx, dy] of [[-4, -6], [6, -3], [3, 6], [-6, 4]] as const) ctx.fillRect(c.x + dx - 1.5, c.y + dy - 1.5, 3, 3);
  }
  ctx.restore();
}

/**
 * Free Transform (E): the Selection's box (move, scale, rotate) plus a widget with four modes. In Free Transform
 * Ctrl on a side handle skews and Ctrl on a corner distorts; Perspective and Free Distort move the corners of the
 * box and change the geometry itself (live shapes become paths), as one undo step per drag.
 */
export function createFreeTransformTool(): Tool {
  const inner = createSelectionTool('tool-free-transform');
  let gesture: Gesture | null = null;
  let hoverCursor: string | null = null;

  const adjusted = (event: CanvasPointerEvent, forceShift: boolean): CanvasPointerEvent => (forceShift ? { ...event, shiftKey: true } : event);

  function startDistort(event: CanvasPointerEvent, host: ToolHost, mode: 'distort' | 'perspective', ids: string[], bounds: Rect, handle: HandleId): void {
    const { space } = host;
    if (!space) return;
    const nodes = ids.map((id) => locateNode(space, id)?.node).filter((n): n is Node => !!n);
    if (!isDistortable(nodes)) {
      void host.confirm({ title: t('freeTransform.cannotDistort'), buttons: [{ id: 'ok', label: t('dialog.ok'), variant: 'primary' }] });
      gesture = { kind: 'widget' };
      return;
    }
    gesture = { kind: 'quad', mode, handle, rect: bounds, ids, frozen: space, key: host.gestureKey(), start: event.doc, screen: event.screen, started: false, quad: rectQuad(bounds) };
  }

  function dragDistort(event: CanvasPointerEvent, host: ToolHost, g: Extract<Gesture, { kind: 'quad' }>): void {
    const { session, space } = host;
    if (!session || !space) return;
    if (!g.started && dragged(event.screen, g.screen)) g.started = true;
    if (!g.started) return;
    let delta: Vec2 = { x: event.doc.x - g.start.x, y: event.doc.y - g.start.y };
    if (event.shiftKey && g.mode === 'distort') delta = constrainTo45(delta);
    g.quad = dragQuad(g.mode, g.handle, g.rect, delta);
    const map = quadMapper(g.rect, g.quad, g.mode === 'perspective' ? 'perspective' : 'free');
    // Always distort from the objects as they were when the drag began, never step by step.
    const nodes = map ? distortNodes(g.frozen, g.ids, map) : null;
    if (nodes) session.run(replaceNodes(space.id, nodes.map((n) => ({ id: n.id, nodes: [n] })), 'node.distort', g.key));
    host.invalidateOverlay();
  }

  function dragSkew(event: CanvasPointerEvent, host: ToolHost, g: Extract<Gesture, { kind: 'skew' }>): void {
    const { session, space } = host;
    if (!session || !space) return;
    if (!g.started && dragged(event.screen, g.screen)) g.started = true;
    if (!g.started) return;
    const from = toBoxSpace(g.box, g.start);
    const to = toBoxSpace(g.box, event.doc);
    const total = skewFromHandle(g.handle, g.box.rect, { x: to.x - from.x, y: to.y - from.y }, g.box.theta);
    if (!total) return;
    session.run(transformNodesScaling(space.id, g.ids, stepBetween(total, g.applied), host.scaleStrokes, g.key));
    g.applied = total;
  }

  function updateHover(event: CanvasPointerEvent, host: ToolHost): boolean {
    const ids = selectedTopLevel(host);
    const bounds = ids.length > 0 ? boxOf(host, ids) : null;
    hoverCursor = null;
    if (!bounds || host.options.hideEdges) return false;
    const over = widgetAt(host, bounds, event.screen);
    if (over) {
      hoverCursor = 'pointer';
      host.setMeasure(t(`freeTransform.${over}` as const), { x: event.screen.x + 14, y: event.screen.y + 14 });
      host.setHover(null);
      return true;
    }
    host.setMeasure(null);
    if (currentMode === 'perspective' || currentMode === 'distort') {
      const handle = handleAt(toScreenRect(bounds, host.view.zoom, host.view.panX, host.view.panY), event.screen);
      if (handle && (currentMode === 'distort' || handle.length === 2)) {
        hoverCursor = cursorForHandle(handle);
        host.setHover(null);
        return true;
      }
    }
    return false;
  }

  return {
    id: 'tool-free-transform',
    cursor: (altKey) => (gesture?.kind === 'quad' ? 'crosshair' : gesture?.kind === 'skew' ? 'ew-resize' : (hoverCursor ?? inner.cursor(altKey))),
    wantsSpace: () => gesture?.kind === 'delegate' && (inner.wantsSpace?.() ?? false),
    gestureKeys: true,

    onActivate(host) {
      gesture = null;
      inner.onActivate?.(host);
    },

    onPointerDown(event, host) {
      const { space } = host;
      if (!space || !host.session) return;
      const ids = selectedTopLevel(host);
      const bounds = ids.length > 0 ? boxOf(host, ids) : null;

      if (bounds && !host.options.hideEdges && event.clickCount < 2) {
        const over = widgetAt(host, bounds, event.screen);
        if (over) {
          currentMode = over;
          gesture = { kind: 'widget' };
          host.invalidateOverlay();
          return;
        }

        // Perspective and Free Distort: the corners of the box (and, for Free Distort, its sides) are the handles.
        if (currentMode === 'perspective' || currentMode === 'distort') {
          const handle = handleAt(toScreenRect(bounds, host.view.zoom, host.view.panX, host.view.panY), event.screen);
          if (handle && (currentMode === 'distort' || handle.length === 2)) {
            startDistort(event, host, currentMode, ids, bounds, handle);
            return;
          }
        }

        const box = orientedBoxOf(space, ids, 0);
        if (box) {
          const handle = handleAt(boxScreenRect(box, host.view), toBoxScreen(box, event.screen));
          if (handle && currentMode === 'free' && event.ctrlKey) {
            if (handle.length === 1) {
              gesture = { kind: 'skew', handle, box, ids, key: host.gestureKey(), start: event.doc, screen: event.screen, started: false, applied: IDENTITY };
              return;
            }
            if (box.theta === 0) {
              startDistort(event, host, event.altKey && event.shiftKey ? 'perspective' : 'distort', ids, bounds, handle);
              return;
            }
          }
          if (handle && currentMode === 'constrain') {
            gesture = { kind: 'delegate', forceShift: true };
            inner.onPointerDown(adjusted(event, true), host);
            return;
          }
        }
      }
      gesture = { kind: 'delegate', forceShift: false };
      inner.onPointerDown(event, host);
    },

    onPointerMove(event, host) {
      const g = gesture;
      if (!g) {
        if (!updateHover(event, host)) inner.onPointerMove(event, host);
        return;
      }
      if (g.kind === 'widget') return;
      if (g.kind === 'quad') dragDistort(event, host, g);
      else if (g.kind === 'skew') dragSkew(event, host, g);
      else inner.onPointerMove(adjusted(event, g.forceShift), host);
    },

    onPointerUp(event, host) {
      const g = gesture;
      gesture = null;
      if (!g || g.kind === 'widget') return;
      if (g.kind === 'quad') {
        host.invalidateOverlay();
      } else if (g.kind === 'skew') {
        if (g.started) host.rememberTransform({ matrix: g.applied, copy: false });
      } else {
        inner.onPointerUp(adjusted(event, g.forceShift), host);
      }
    },

    onKey(key, host) {
      const g = gesture;
      if (key === 'Escape' && g && (g.kind === 'quad' || g.kind === 'skew')) {
        if (g.started) host.session?.rollback();
        gesture = null;
        host.invalidateOverlay();
        return;
      }
      inner.onKey?.(key, host);
    },

    onKeyDown: (event, host) => inner.onKeyDown?.(event, host) ?? false,
    onKeyUp: (key, host) => inner.onKeyUp?.(key, host),
    onLeave(host) {
      hoverCursor = null;
      inner.onLeave?.(host);
    },

    cancel(host) {
      const g = gesture;
      if (g && (g.kind === 'quad' || g.kind === 'skew') && g.started) host.session?.rollback();
      gesture = null;
      hoverCursor = null;
      inner.cancel?.(host);
    },

    drawOverlay(ctx, host, theme) {
      const ids = selectedTopLevel(host);
      const bounds = ids.length > 0 ? boxOf(host, ids) : null;
      const distorting = currentMode === 'perspective' || currentMode === 'distort';
      if (!(distorting && bounds)) inner.drawOverlay?.(ctx, host, theme);
      if (!bounds || host.options.hideEdges) return;

      if (distorting) {
        const quad = gesture?.kind === 'quad' ? gesture.quad : rectQuad(bounds);
        const toScreen = (p: Vec2): Vec2 => ({ x: Math.floor(p.x * host.view.zoom + host.view.panX) + 0.5, y: Math.floor(p.y * host.view.zoom + host.view.panY) + 0.5 });
        const corners = [quad.nw, quad.ne, quad.se, quad.sw].map(toScreen);
        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = theme.accent;
        ctx.beginPath();
        corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        const points: Vec2[] = currentMode === 'distort' ? [...corners, ...corners.map((p, i) => ({ x: (p.x + (corners[(i + 1) % 4] as Vec2).x) / 2, y: (p.y + (corners[(i + 1) % 4] as Vec2).y) / 2 }))] : corners;
        for (const p of points) {
          ctx.fillRect(Math.floor(p.x) - 2.5, Math.floor(p.y) - 2.5, 6, 6);
          ctx.strokeRect(Math.floor(p.x) - 2.5, Math.floor(p.y) - 2.5, 6, 6);
        }
        ctx.restore();
      }

      for (const b of widgetRects(host, bounds)) {
        const active = b.mode === currentMode;
        ctx.save();
        ctx.fillStyle = active ? theme.accent : 'rgba(30,30,32,0.92)';
        ctx.strokeStyle = active ? theme.accent : 'rgba(160,160,165,0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(b.x + 0.5, b.y + 0.5, BUTTON, BUTTON, 4);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        drawGlyph(ctx, b.mode, b.x, b.y, '#ffffff');
      }
    },
  };
}

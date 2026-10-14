import {
  cloneNodes,
  duplicateNodes,
  locateNode,
  rectCenter,
  reflectAbout,
  rotateAbout,
  scaleAbout,
  selectOnly,
  transformNodesScaling,
  type Matrix,
  type Node,
  type Vec2,
} from '../../core';
import { angleBetween, constrainTo45, snapAngle45 } from './boxGeometry';
import { boxOf, dragged, selectedTopLevel, stepBetween } from './shared';
import type { Tool, ToolHost, TransformKind } from './types';
import { ROTATE_CURSOR } from './cursors';
import type { ToolId } from '../app/tools';

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const IDS: Record<TransformKind, ToolId> = { rotate: 'tool-rotate', scale: 'tool-scale', reflect: 'tool-reflect', move: 'tool-select' };

interface Gesture {
  screen: Vec2;
  doc: Vec2;
  copy: boolean;
  alt: boolean;
  ids: string[];
  key: string;
  applied: Matrix;
  duplicated: boolean;
  running: boolean;
}

/**
 * Rotate (R), Reflect (O) and Scale (S). Click sets the origin; drag transforms around it (Alt+drag
 * copies, Alt+click opens the dialog). Reflect: click the origin, then click or drag to give the axis.
 */
export function createTransformTool(kind: Exclude<TransformKind, 'move'>): Tool {
  let origin: Vec2 | null = null;
  let gesture: Gesture | null = null;
  let cursorPoint: Vec2 | null = null;

  const center = (host: ToolHost): Vec2 | null => {
    const box = boxOf(host, selectedTopLevel(host));
    return origin ?? (box ? rectCenter(box) : null);
  };

  function matrixFor(event: { doc: Vec2; shiftKey: boolean }, from: Vec2, around: Vec2): Matrix {
    if (kind === 'rotate') {
      let angle = angleBetween(around, from, event.doc);
      if (event.shiftKey) angle = snapAngle45(angle);
      return rotateAbout(angle, around);
    }
    if (kind === 'scale') {
      const start = Math.hypot(from.x - around.x, from.y - around.y);
      const now = Math.hypot(event.doc.x - around.x, event.doc.y - around.y);
      const factor = start < 1e-6 ? 1 : Math.max(0.001, now / start);
      return scaleAbout(factor, factor, around);
    }
    // Reflect: the axis runs from the origin to the pointer.
    const vector = { x: event.doc.x - around.x, y: event.doc.y - around.y };
    const v = event.shiftKey ? constrainTo45(vector) : vector;
    return reflectAbout(Math.atan2(v.y, v.x), around);
  }

  function apply(host: ToolHost, g: Gesture, next: Matrix): void {
    const { session, space } = host;
    if (!session || !space) return;
    if (g.copy && !g.duplicated) {
      const nodes = g.ids.map((id) => locateNode(space, id)?.node).filter((n): n is Node => !!n);
      const clones = cloneNodes(nodes, session.ids);
      session.run(duplicateNodes(space.id, g.ids, clones, next, g.key), selectOnly(space.id, clones.map((c) => c.id)));
      g.ids = clones.map((c) => c.id);
      g.duplicated = true;
    } else {
      session.run(transformNodesScaling(space.id, g.ids, stepBetween(next, g.applied), host.scaleStrokes, g.key));
    }
    g.applied = next;
  }

  return {
    id: IDS[kind],
    cursor: () => (kind === 'rotate' ? ROTATE_CURSOR : 'crosshair'),

    onPointerDown(event, host) {
      const ids = selectedTopLevel(host);
      gesture = { screen: event.screen, doc: event.doc, copy: event.altKey, alt: event.altKey, ids, key: host.gestureKey(), applied: IDENTITY, duplicated: false, running: false };
    },

    onPointerMove(event, host) {
      cursorPoint = event.doc;
      const g = gesture;
      if (!g) {
        if (kind === 'reflect' && origin) host.invalidateOverlay();
        return;
      }
      if (!g.running && dragged(event.screen, g.screen)) g.running = g.ids.length > 0;
      if (!g.running) return;
      const around = kind === 'reflect' ? (origin ?? center(host)) : center(host);
      if (!around) return;
      // Reflect needs an axis: from the origin to the pointer. Rotate/scale compare against where the drag began.
      if (kind === 'reflect') {
        host.invalidateOverlay();
        return;
      }
      apply(host, g, matrixFor(event, g.doc, around));
    },

    onPointerUp(event, host) {
      const g = gesture;
      gesture = null;
      if (!g) return;
      const around = center(host);

      if (g.running) {
        if (kind === 'reflect' && around) apply(host, g, matrixFor(event, g.doc, origin ?? around));
        host.rememberTransform({ matrix: g.applied, copy: g.duplicated });
        if (kind === 'reflect') origin = null;
        host.invalidateOverlay();
        return;
      }

      // A click.
      if (g.alt) {
        origin = event.doc;
        host.openTransformDialog(kind, origin);
        host.invalidateOverlay();
        return;
      }
      if (kind === 'reflect' && origin && g.ids.length > 0) {
        // Second click: reflect across the line origin → click.
        const next = matrixFor(event, event.doc, origin);
        apply(host, { ...g, doc: event.doc }, next);
        host.rememberTransform({ matrix: next, copy: false });
        origin = null;
      } else {
        origin = event.doc;
      }
      host.invalidateOverlay();
    },

    onKey(key, host) {
      if (key !== 'Escape') return;
      if (gesture?.running) host.session?.rollback();
      gesture = null;
      origin = null;
      host.invalidateOverlay();
    },

    cancel(host) {
      if (gesture?.running) host.session?.rollback();
      gesture = null;
      origin = null;
      host.invalidateOverlay();
    },

    drawOverlay(ctx, host, theme) {
      const c = center(host);
      if (!c) return;
      const view = host.view;
      const sx = c.x * view.zoom + view.panX;
      const sy = c.y * view.zoom + view.panY;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.moveTo(sx - 9, sy);
      ctx.lineTo(sx + 9, sy);
      ctx.moveTo(sx, sy - 9);
      ctx.lineTo(sx, sy + 9);
      ctx.stroke();
      if (kind === 'reflect' && origin && cursorPoint) {
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(cursorPoint.x * view.zoom + view.panX, cursorPoint.y * view.zoom + view.panY);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

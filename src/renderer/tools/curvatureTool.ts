import {
  addNode,
  createPath,
  curvatureAnchors,
  emptySelection,
  insertAnchor,
  pathFrameOf,
  removeNodes,
  reverseAnchors,
  selectOnly,
  setPathAnchors,
  setPathGeometry,
  type Anchor,
  type PathFrame,
  type Vec2,
} from '../../core';
import { penCursor, type PenBadge } from './cursors';
import { anchorAt, editableFrame, endpointAt, segmentAt, selectedFrames, toLocalPoint, toWorldPoint } from './pathHits';
import { dragged, snapTo } from './shared';
import type { Tool, ToolHost } from './types';

/** Positions and sharp anchors of a path, which is all the Curvature tool needs to rebuild its curve. */
function pointsOf(anchors: readonly Anchor[]): { points: Vec2[]; corners: Set<number> } {
  const corners = new Set<number>();
  anchors.forEach((a, i) => {
    if (a.kind === 'corner') corners.add(i);
  });
  return { points: anchors.map((a) => a.p), corners };
}

interface Drawing {
  id: string;
  created: boolean;
}

interface Move {
  index: number;
  key: string;
  down: Vec2;
  started: boolean;
}

/**
 * Curvature (Shift+~): every click places an anchor and the curve flows smoothly through all of them.
 * Double click or Alt+click makes a corner; double click on an anchor toggles smooth / corner; dragging
 * an anchor moves it and the curve is recomputed (specs/03 · Curvatura).
 */
export function createCurvatureTool(): Tool {
  let drawing: Drawing | null = null;
  let move: Move | null = null;
  let hover: Vec2 | null = null;
  let badge: PenBadge = 'new';

  function frame(host: ToolHost): PathFrame | null {
    if (!drawing || !host.space) return null;
    const f = pathFrameOf(host.space, drawing.id);
    if (!f) drawing = null;
    return f;
  }

  function finish(host: ToolHost): void {
    const d = drawing;
    drawing = null;
    move = null;
    hover = null;
    host.invalidateOverlay();
    const { session, space } = host;
    if (!d || !session || !space) return;
    const f = pathFrameOf(space, d.id);
    if (f && d.created && f.path.anchors.length < 2) session.run(removeNodes(space.id, [d.id]), emptySelection(space.id));
  }

  function rebuild(host: ToolHost, f: PathFrame, points: Vec2[], corners: Set<number>, key: string, closed = f.path.closed): void {
    const { session, space } = host;
    if (!session || !space) return;
    const anchors = curvatureAnchors(points, corners, closed);
    if (closed !== f.path.closed) session.run(setPathGeometry(space.id, f.path.id, anchors, closed, key));
    else session.run(setPathAnchors(space.id, f.path.id, anchors, key));
  }

  function startPath(host: ToolHost, doc: Vec2): void {
    const { session, space } = host;
    const layerId = host.activeLayerId;
    if (!session || !space || !layerId) return;
    const p = snapTo(host, doc);
    const key = host.gestureKey();
    const node = createPath(session.ids, curvatureAnchors([p]), false);
    session.run(addNode(space.id, layerId, node, undefined, `path.edit:${key}`), selectOnly(space.id, [node.id]));
    drawing = { id: node.id, created: true };
  }

  function computeBadge(host: ToolHost, p: Vec2): PenBadge {
    const f = frame(host);
    if (f) {
      const hit = anchorAt(host, [f], p);
      return hit && hit.index === 0 && f.path.anchors.length >= 3 ? 'close' : 'none';
    }
    const selected = selectedFrames(host);
    if (anchorAt(host, selected, p)) return 'none';
    if (endpointAt(host, p)) return 'continue';
    return 'new';
  }

  return {
    id: 'tool-curvature',
    cursor: () => penCursor(badge),
    gestureKeys: false,

    onPointerDown(event, host) {
      const { session, space } = host;
      if (event.button !== 0 || !session || !space) return;
      const f = frame(host);

      if (f) {
        const { points, corners } = pointsOf(f.path.anchors);
        const hit = anchorAt(host, [f], event.doc);
        if (hit && hit.index === 0 && points.length >= 3) {
          rebuild(host, f, points, corners, host.gestureKey(), true);
          drawing = null;
          badge = 'new';
          return;
        }
        const last = points.length - 1;
        if (hit && hit.index === last && event.clickCount >= 2) {
          // Double click on the point just placed: it becomes a corner.
          if (corners.has(last)) corners.delete(last);
          else corners.add(last);
          rebuild(host, f, points, corners, host.gestureKey());
          return;
        }
        const p = toLocalPoint(f.world, snapTo(host, event.doc));
        const index = points.length;
        const next = [...points, p];
        if (event.altKey) corners.add(index);
        rebuild(host, f, next, corners, host.gestureKey());
        return;
      }

      const key = host.gestureKey();
      // Anchors of the selected path: drag to move, double click to toggle smooth / corner.
      const selected = selectedFrames(host);
      const anchor = anchorAt(host, selected, event.doc);
      if (anchor) {
        const editable = editableFrame(host, anchor.frame, key) ?? anchor.frame;
        if (event.clickCount >= 2) {
          const { points, corners } = pointsOf(editable.path.anchors);
          if (corners.has(anchor.index)) corners.delete(anchor.index);
          else corners.add(anchor.index);
          rebuild(host, editable, points, corners, key);
          return;
        }
        move = { index: anchor.index, key, down: event.screen, started: false };
        drawing = { id: editable.path.id, created: false };
        return;
      }
      const endpoint = endpointAt(host, event.doc);
      if (endpoint) {
        if (endpoint.end === 'start' && endpoint.frame.path.anchors.length > 1) {
          session.run(setPathGeometry(space.id, endpoint.frame.path.id, reverseAnchors(endpoint.frame.path.anchors), false, key));
        }
        drawing = { id: endpoint.frame.path.id, created: false };
        session.select(selectOnly(space.id, [endpoint.frame.path.id]));
        return;
      }
      const segment = segmentAt(host, selected, event.doc);
      if (segment) {
        const editable = editableFrame(host, segment.frame, key);
        if (!editable) return;
        const inserted = insertAnchor(editable.path.anchors, editable.path.closed, segment.segment, segment.t);
        if (inserted.index >= 0) {
          const { points, corners } = pointsOf(inserted.anchors);
          rebuild(host, editable, points, corners, key);
        }
        return;
      }
      startPath(host, event.doc);
    },

    onPointerMove(event, host) {
      hover = event.doc;
      const m = move;
      if (!m) {
        badge = computeBadge(host, event.doc);
        host.invalidateOverlay();
        return;
      }
      if (!m.started && dragged(event.screen, m.down)) m.started = true;
      const f = frame(host);
      if (!m.started || !f) return;
      const { points, corners } = pointsOf(f.path.anchors);
      points[m.index] = toLocalPoint(f.world, snapTo(host, event.doc));
      rebuild(host, f, points, corners, m.key);
    },

    onPointerUp(_event, host) {
      const m = move;
      move = null;
      host.setSnapLines(null);
      // A click on an anchor without moving it just leaves the path active for editing.
      if (m && !m.started) drawing = null;
    },

    onKey(key, host) {
      if (key === 'Escape' || key === 'Enter') finish(host);
    },

    cancel(host) {
      finish(host);
    },

    drawOverlay(ctx, host, theme) {
      const f = frame(host);
      const view = host.view;
      const toScreen = (frameWorld: PathFrame['world'], p: Vec2) => {
        const w = toWorldPoint(frameWorld, p);
        return { x: w.x * view.zoom + view.panX, y: w.y * view.zoom + view.panY };
      };
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = theme.accent;
      const frames = f ? [f] : selectedFrames(host);
      for (const fr of frames) {
        for (const a of fr.path.anchors) {
          const p = toScreen(fr.world, a.p);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(Math.round(p.x) - 2.5, Math.round(p.y) - 2.5, 6, 6);
          ctx.strokeRect(Math.round(p.x) - 2.5, Math.round(p.y) - 2.5, 6, 6);
        }
      }
      // Live preview of the next curve: the path as it would be with the cursor as one more point.
      if (f && hover && !move && !f.path.closed) {
        const { points, corners } = pointsOf(f.path.anchors);
        const local = toLocalPoint(f.world, hover);
        const preview = curvatureAnchors([...points, local], corners, false);
        const n = preview.length;
        for (let i = Math.max(0, n - 3); i < n - 1; i++) {
          const a = preview[i] as Anchor;
          const b = preview[i + 1] as Anchor;
          const p0 = toScreen(f.world, a.p);
          const c1 = toScreen(f.world, a.out ?? a.p);
          const c2 = toScreen(f.world, b.in ?? b.p);
          const p3 = toScreen(f.world, b.p);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  };
}

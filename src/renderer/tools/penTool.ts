import {
  addNode,
  closeOpenPath,
  cornerAnchor,
  createPath,
  emptySelection,
  insertAnchor,
  joinPaths,
  joinPathNodes,
  pathFrameOf,
  removeAnchors,
  removeNodes,
  reverseAnchors,
  selectOnly,
  setPathAnchors,
  setPathGeometry,
  smoothAnchor,
  type Anchor,
  type Matrix,
  type PathFrame,
  type Vec2,
} from '../../core';
import { constrainTo45 } from './boxGeometry';
import { createConvertTool } from './anchorTools';
import { penCursor, type PenBadge } from './cursors';
import { createDirectSelectionTool } from './directSelectionTool';
import { anchorAt, editableFrame, endpointAt, pickRadius, segmentAt, selectedFrames, toLocalPoint, toWorldPoint } from './pathHits';
import { dragged, snapTo, withLook } from './shared';
import type { Tool, ToolHost } from './types';

/** Pen: auto add/delete anchors on the selected path (specs/03 · Pluma · 9). "Preferencias" will make it optional. */
const AUTO_ADD_DELETE = true;

interface Drawing {
  id: string;
  /** True when this tool created the path (a lone anchor is discarded when drawing ends). */
  created: boolean;
}

type Gesture =
  | { mode: 'place'; index: number; key: string; origin: Vec2; world: Matrix; down: Vec2; dragging: boolean; frozenIn: Vec2 | null; spaceOffset: Vec2 | null; last: Vec2 }
  | { mode: 'last'; index: number; key: string; world: Matrix; down: Vec2; dragging: boolean }
  | { mode: 'close'; key: string; world: Matrix; down: Vec2; dragging: boolean };

/**
 * Pen (P): the exact behaviour of specs/03 · Pluma. States: idle → placing → (dragging a handle) →
 * placing … → done. The path lives in the document from the first click; each anchor and its handle
 * drag form one undo step, so Ctrl+Z removes the last point as in Illustrator.
 */
export function createPenTool(): Tool {
  let drawing: Drawing | null = null;
  let gesture: Gesture | null = null;
  let hover: Vec2 | null = null;
  let badge: PenBadge = 'new';
  let overAnchor = false;
  let forwarded: Tool | null = null;
  let spaceDown = false;
  const direct = createDirectSelectionTool();
  const convert = createConvertTool();

  function frame(host: ToolHost): PathFrame | null {
    if (!drawing || !host.space) return null;
    const f = pathFrameOf(host.space, drawing.id);
    if (!f) drawing = null; // undone from under us
    return f;
  }

  /** Ends the current path (Esc, Enter, tool change…). A path of one lone anchor is discarded. */
  function finish(host: ToolHost): void {
    const d = drawing;
    drawing = null;
    gesture = null;
    hover = null;
    host.setSnapLines(null);
    host.invalidateOverlay();
    const { session, space } = host;
    if (!d || !session || !space) return;
    const f = pathFrameOf(space, d.id);
    if (f && d.created && f.path.anchors.length < 2) session.run(removeNodes(space.id, [d.id]), emptySelection(space.id));
  }

  function select(host: ToolHost, id: string): void {
    const space = host.space;
    if (space) host.session?.select(selectOnly(space.id, [id]));
  }

  function startPath(host: ToolHost, doc: Vec2): void {
    const { session, space } = host;
    const layerId = host.activeLayerId;
    if (!session || !space || !layerId) return;
    const p = snapTo(host, doc);
    const key = host.gestureKey();
    const node = withLook(createPath(session.ids, [cornerAnchor(p)], false), host);
    session.run(addNode(space.id, layerId, node, undefined, `path.edit:${key}`), selectOnly(space.id, [node.id]));
    drawing = { id: node.id, created: true };
    gesture = { mode: 'place', index: 0, key, origin: p, world: [1, 0, 0, 1, 0, 0], down: doc, dragging: false, frozenIn: null, spaceOffset: null, last: doc };
  }

  function placeAnchor(host: ToolHost, f: PathFrame, doc: Vec2, shift: boolean): void {
    const { session, space } = host;
    if (!session || !space) return;
    const anchors = f.path.anchors;
    const prev = anchors[anchors.length - 1];
    let p = snapTo(host, doc);
    if (shift && prev) {
      const from = toWorldPoint(f.world, prev.p);
      const d = constrainTo45({ x: doc.x - from.x, y: doc.y - from.y });
      p = { x: from.x + d.x, y: from.y + d.y };
    }
    const local = toLocalPoint(f.world, p);
    const key = host.gestureKey();
    session.run(setPathAnchors(space.id, f.path.id, [...anchors, cornerAnchor(local)], key));
    gesture = { mode: 'place', index: anchors.length, key, origin: local, world: f.world, down: doc, dragging: false, frozenIn: null, spaceOffset: null, last: doc };
  }

  function setAnchor(host: ToolHost, f: PathFrame, index: number, anchor: Anchor, key: string): void {
    const { session, space } = host;
    if (!session || !space) return;
    const anchors = f.path.anchors.slice();
    anchors[index] = anchor;
    session.run(setPathAnchors(space.id, f.path.id, anchors, key));
  }

  /** Clicking an end of another open path while drawing joins both (specs/03 · Pluma · 8). */
  function joinWith(host: ToolHost, f: PathFrame, other: { frame: PathFrame; end: 'start' | 'end' }): void {
    const { session, space } = host;
    if (!session || !space) return;
    const joined = joinPaths(f.path.anchors, 'end', other.frame.path.anchors, other.end);
    session.run(joinPathNodes(space.id, f.path.id, [other.frame.path.id], joined, false), selectOnly(space.id, [f.path.id]));
    drawing = null;
  }

  function continuePath(host: ToolHost, hit: { frame: PathFrame; end: 'start' | 'end' }): void {
    const { session, space } = host;
    if (!session || !space) return;
    if (hit.end === 'start' && hit.frame.path.anchors.length > 1) {
      session.run(setPathGeometry(space.id, hit.frame.path.id, reverseAnchors(hit.frame.path.anchors), false, host.gestureKey()));
    }
    drawing = { id: hit.frame.path.id, created: false };
    select(host, hit.frame.path.id);
  }

  /** Alt+drag of a handle keeps symmetry for the in handle until Alt: here, the drag of a freshly placed anchor. */
  function dragPlace(host: ToolHost, g: Extract<Gesture, { mode: 'place' }>, event: { doc: Vec2; shiftKey: boolean; altKey: boolean }): void {
    const f = frame(host);
    if (!f) return;
    const previous = f.path.anchors[g.index];
    if (!previous) return;
    if (spaceDown) {
      // Space moves the anchor being placed; the handle keeps its offset from it.
      const offset = g.spaceOffset ?? (previous.out ? { x: previous.out.x - g.origin.x, y: previous.out.y - g.origin.y } : { x: 0, y: 0 });
      g.spaceOffset = offset;
      const dx = event.doc.x - g.last.x;
      const dy = event.doc.y - g.last.y;
      const move = toLocalPoint(g.world, { x: toWorldPoint(g.world, g.origin).x + dx, y: toWorldPoint(g.world, g.origin).y + dy });
      g.origin = move;
      g.last = event.doc;
      setAnchor(host, f, g.index, { ...previous, p: move, out: { x: move.x + offset.x, y: move.y + offset.y }, in: previous.in && { x: move.x - offset.x, y: move.y - offset.y } }, g.key);
      return;
    }
    g.spaceOffset = null;
    g.last = event.doc;
    const originWorld = toWorldPoint(g.world, g.origin);
    const d = event.shiftKey ? constrainTo45({ x: event.doc.x - originWorld.x, y: event.doc.y - originWorld.y }) : { x: event.doc.x - originWorld.x, y: event.doc.y - originWorld.y };
    const handle = toLocalPoint(g.world, { x: originWorld.x + d.x, y: originWorld.y + d.y });
    if (event.altKey && !g.frozenIn) g.frozenIn = previous.in ?? { x: 2 * g.origin.x - handle.x, y: 2 * g.origin.y - handle.y };
    const next: Anchor = g.frozenIn ? { p: g.origin, in: g.frozenIn, out: handle, kind: 'corner' } : smoothAnchor(g.origin, handle);
    setAnchor(host, f, g.index, next, g.key);
  }

  function computeBadge(host: ToolHost, p: Vec2, ctrl: boolean): PenBadge {
    overAnchor = false;
    if (ctrl) return 'none';
    const f = frame(host);
    if (f) {
      const hit = anchorAt(host, [f], p);
      overAnchor = !!hit;
      if (hit && hit.index === 0 && f.path.anchors.length >= 2 && !f.path.closed) return 'close';
      if (hit && hit.index === f.path.anchors.length - 1) return 'convert';
      if (endpointAt(host, p, f.path.id)) return 'continue';
      return 'none';
    }
    const frames = selectedFrames(host).filter((x) => !x.live || x.owner.type === 'shape');
    const anchor = anchorAt(host, frames, p);
    overAnchor = !!anchor || !!anchorAt(host, selectedFrames(host), p);
    if (endpointAt(host, p)) return 'continue';
    if (AUTO_ADD_DELETE && anchor) return 'delete';
    if (AUTO_ADD_DELETE && segmentAt(host, frames, p)) return 'add';
    return 'new';
  }

  return {
    id: 'tool-pen',
    cursor: (altKey) => penCursor(altKey && overAnchor ? 'convert' : badge),
    wantsSpace: () => gesture?.dragging === true,
    gestureKeys: true,

    onPointerDown(event, host) {
      const { session, space } = host;
      if (event.button !== 0 || !session || !space) return;

      // Ctrl: Direct Selection for this click (a click on empty space also ends the path).
      if (event.ctrlKey || event.metaKey) {
        finish(host);
        forwarded = direct;
        direct.onPointerDown(event, host);
        return;
      }
      // Alt on an existing anchor: Convert Anchor Point for this click.
      const frames = drawing && frame(host) ? [frame(host) as PathFrame] : selectedFrames(host);
      if (event.altKey && anchorAt(host, frames, event.doc)) {
        forwarded = convert;
        convert.onPointerDown(event, host);
        return;
      }

      const f = frame(host);
      if (f) {
        const n = f.path.anchors.length;
        const hit = anchorAt(host, [f], event.doc);
        if (hit && hit.index === 0 && n >= 2) {
          // Close: click closes, click-and-drag closes with a curve.
          const key = host.gestureKey();
          session.run(setPathGeometry(space.id, f.path.id, closeOpenPath(f.path.anchors), true, key));
          gesture = { mode: 'close', key, world: f.world, down: event.screen, dragging: false };
          return;
        }
        if (hit && hit.index === n - 1) {
          gesture = { mode: 'last', index: n - 1, key: host.gestureKey(), world: f.world, down: event.screen, dragging: false };
          return;
        }
        const other = endpointAt(host, event.doc, f.path.id);
        if (other) {
          joinWith(host, f, other);
          return;
        }
        placeAnchor(host, f, event.doc, event.shiftKey);
        if (gesture?.mode === 'place') gesture.down = event.screen;
        return;
      }

      // Not drawing yet.
      const endpoint = endpointAt(host, event.doc);
      if (endpoint) {
        continuePath(host, endpoint);
        return;
      }
      if (AUTO_ADD_DELETE) {
        const selected = selectedFrames(host).filter((x) => x.owner.type === 'path' || x.live);
        const anchor = anchorAt(host, selected, event.doc);
        const key = host.gestureKey();
        if (anchor) {
          const editable = editableFrame(host, anchor.frame, key);
          if (!editable) return;
          const next = removeAnchors(editable.path.anchors, [anchor.index]);
          if (next) session.run(setPathAnchors(space.id, editable.path.id, next, key));
          else session.run(removeNodes(space.id, [editable.owner.id]), emptySelection(space.id));
          return;
        }
        const segment = segmentAt(host, selected, event.doc);
        if (segment) {
          const editable = editableFrame(host, segment.frame, key);
          if (!editable) return;
          const inserted = insertAnchor(editable.path.anchors, editable.path.closed, segment.segment, segment.t);
          if (inserted.index >= 0) session.run(setPathAnchors(space.id, editable.path.id, inserted.anchors, key));
          return;
        }
      }
      startPath(host, event.doc);
      if (gesture?.mode === 'place') gesture.down = event.screen;
    },

    onPointerMove(event, host) {
      if (forwarded) {
        forwarded.onPointerMove(event, host);
        return;
      }
      hover = event.doc;
      const g = gesture;
      if (!g) {
        badge = computeBadge(host, event.doc, event.ctrlKey || event.metaKey);
        host.invalidateOverlay();
        return;
      }
      if (!g.dragging && dragged(event.screen, g.down)) g.dragging = true;
      if (!g.dragging) return;
      const f = frame(host);
      if (!f) return;
      if (g.mode === 'place') {
        dragPlace(host, g, event);
        return;
      }
      const index = g.mode === 'last' ? g.index : 0;
      const anchor = f.path.anchors[index];
      if (!anchor) return;
      const pw = toWorldPoint(g.world, anchor.p);
      const d = event.shiftKey ? constrainTo45({ x: event.doc.x - pw.x, y: event.doc.y - pw.y }) : { x: event.doc.x - pw.x, y: event.doc.y - pw.y };
      const handle = toLocalPoint(g.world, { x: pw.x + d.x, y: pw.y + d.y });
      if (g.mode === 'last') {
        // A new, independent out handle (a cusp).
        setAnchor(host, f, index, { ...anchor, out: handle, kind: 'corner' }, g.key);
      } else {
        const closing = event.altKey ? { ...anchor, out: handle, kind: 'corner' as const } : smoothAnchor(anchor.p, handle);
        const anchors = f.path.anchors.slice();
        anchors[0] = closing;
        host.session?.run(setPathGeometry(host.space?.id ?? '', f.path.id, anchors, true, g.key));
      }
    },

    onPointerUp(event, host) {
      if (forwarded) {
        const tool = forwarded;
        forwarded = null;
        tool.onPointerUp(event, host);
        return;
      }
      const g = gesture;
      gesture = null;
      spaceDown = false;
      host.setSnapLines(null);
      if (!g) return;
      if (g.mode === 'close') {
        const f = frame(host);
        if (f) select(host, f.path.id);
        drawing = null;
        badge = 'new';
        host.invalidateOverlay();
        return;
      }
      if (g.mode === 'last' && !g.dragging) {
        // A click on the last anchor retracts its out handle: the next segment leaves straight.
        const f = frame(host);
        const anchor = f?.path.anchors[g.index];
        if (f && anchor && anchor.out) setAnchor(host, f, g.index, { ...anchor, out: null, kind: 'corner' }, g.key);
      }
      host.invalidateOverlay();
    },

    onKey(key, host) {
      if (key === 'Escape' || key === 'Enter') {
        if (gesture && key === 'Escape') {
          // Escape during a drag keeps the anchor as placed and ends the path.
          gesture = null;
        }
        finish(host);
      }
    },

    onKeyDown(event) {
      if (event.key === ' ' && gesture) {
        spaceDown = true;
        return true;
      }
      return false;
    },

    onKeyUp(key) {
      if (key === ' ') spaceDown = false;
    },

    onLeave() {
      hover = null;
    },

    cancel(host) {
      forwarded?.cancel?.(host);
      forwarded = null;
      finish(host);
    },

    drawOverlay(ctx, host, theme) {
      if (forwarded) {
        forwarded.drawOverlay?.(ctx, host, theme);
        return;
      }
      const f = frame(host);
      const view = host.view;
      const screen = (p: Vec2) => {
        const w = toWorldPoint(f?.world ?? [1, 0, 0, 1, 0, 0], p);
        return { x: w.x * view.zoom + view.panX, y: w.y * view.zoom + view.panY };
      };
      if (!f) {
        // Between paths, show the anchors of the selection like Direct Selection does.
        direct.drawOverlay?.(ctx, host, theme);
        return;
      }
      const anchors = f.path.anchors;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = theme.accent;
      // Rubber band: the next segment follows the cursor.
      const last = anchors[anchors.length - 1];
      if (last && hover && !gesture && !f.path.closed) {
        const from = screen(last.p);
        const c1 = screen(last.out ?? last.p);
        const to = { x: hover.x * view.zoom + view.panX, y: hover.y * view.zoom + view.panY };
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.bezierCurveTo(c1.x, c1.y, to.x, to.y, to.x, to.y);
        ctx.stroke();
      }
      // Handles of the last anchor, then the anchors themselves (last one filled).
      const lastIndex = anchors.length - 1;
      for (const index of [lastIndex - 1, lastIndex]) {
        const a = anchors[index];
        if (!a) continue;
        for (const handle of [a.in, a.out]) {
          if (!handle || index !== lastIndex) continue;
          const from = screen(a.p);
          const to = screen(handle);
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(to.x, to.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = theme.accent;
          ctx.fill();
        }
      }
      anchors.forEach((a, i) => {
        const p = screen(a.p);
        ctx.fillStyle = i === lastIndex ? theme.accent : '#ffffff';
        ctx.fillRect(Math.round(p.x) - 2.5, Math.round(p.y) - 2.5, 6, 6);
        ctx.strokeRect(Math.round(p.x) - 2.5, Math.round(p.y) - 2.5, 6, 6);
      });
      // "○" hint on the first anchor while it can close the path.
      if (badge === 'close' && anchors[0]) {
        const p = screen(anchors[0].p);
        ctx.beginPath();
        ctx.arc(p.x, p.y, pickRadius(host) * view.zoom, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

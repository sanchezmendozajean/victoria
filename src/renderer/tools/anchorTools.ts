import {
  convertToCorner,
  emptySelection,
  insertAnchor,
  moveHandle,
  removeAnchors,
  removeNodes,
  selectOnly,
  setPathAnchors,
  smoothAnchor,
  type PathFrame,
  type Vec2,
} from '../../core';
import { constrainTo45 } from './boxGeometry';
import { penCursor } from './cursors';
import { anchorAt, editableFrame, framesNear, handleAt, segmentAt, selectedFrames, toLocalPoint, toWorldPoint } from './pathHits';
import { dragged } from './shared';
import type { Tool, ToolHost } from './types';

/** Frames the anchor tools can act on at a point: the selected paths first, then any path under the pointer. */
function candidates(host: ToolHost, p: Vec2): PathFrame[] {
  const selected = selectedFrames(host);
  const near = framesNear(host, p);
  const ids = new Set(selected.map((f) => f.path.id));
  return [...selected, ...near.filter((f) => !ids.has(f.path.id))];
}

function selectPath(host: ToolHost, f: PathFrame): void {
  if (host.space) host.session?.select(selectOnly(host.space.id, [f.owner.id]));
}

/** Handles and anchors of the selected paths, in the style of Direct Selection. */
function drawAnchors(ctx: CanvasRenderingContext2D, host: ToolHost, accent: string, withHandles: boolean): void {
  const view = host.view;
  const screen = (f: PathFrame, p: Vec2) => {
    const w = toWorldPoint(f.world, p);
    return { x: w.x * view.zoom + view.panX, y: w.y * view.zoom + view.panY };
  };
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = accent;
  for (const f of selectedFrames(host)) {
    for (const a of f.path.anchors) {
      const p = screen(f, a.p);
      if (withHandles) {
        for (const h of [a.in, a.out]) {
          if (!h) continue;
          const q = screen(f, h);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(q.x, q.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = accent;
          ctx.fill();
        }
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(p.x) - 2.5, Math.round(p.y) - 2.5, 6, 6);
      ctx.strokeRect(Math.round(p.x) - 2.5, Math.round(p.y) - 2.5, 6, 6);
    }
  }
  ctx.restore();
}

type ConvertPress =
  | { kind: 'handle'; frame: PathFrame; index: number; which: 'in' | 'out'; key: string; screen: Vec2; started: boolean }
  | { kind: 'anchor'; frame: PathFrame; index: number; key: string; screen: Vec2; started: boolean };

/**
 * Convert Anchor Point (Shift+C): click a smooth anchor → corner; drag from an anchor → smooth with new
 * symmetric handles; drag a handle → moves it on its own (specs/03 · Convertir punto de ancla).
 */
export function createConvertTool(): Tool {
  let press: ConvertPress | null = null;
  let over: 'anchor' | 'handle' | null = null;

  return {
    id: 'tool-anchor-convert',
    cursor: () => penCursor(over ? 'convert' : 'none'),
    gestureKeys: false,

    onPointerDown(event, host) {
      if (event.button !== 0 || !host.session) return;
      const frames = candidates(host, event.doc);
      const handle = handleAt(host, selectedFrames(host), event.doc);
      if (handle) {
        press = { kind: 'handle', frame: handle.frame, index: handle.index, which: handle.which, key: host.gestureKey(), screen: event.screen, started: false };
        return;
      }
      const anchor = anchorAt(host, frames, event.doc);
      if (anchor) {
        press = { kind: 'anchor', frame: anchor.frame, index: anchor.index, key: host.gestureKey(), screen: event.screen, started: false };
        selectPath(host, anchor.frame);
      } else {
        press = null;
      }
    },

    onPointerMove(event, host) {
      const p = press;
      if (!p) {
        const frames = candidates(host, event.doc);
        over = handleAt(host, selectedFrames(host), event.doc) ? 'handle' : anchorAt(host, frames, event.doc) ? 'anchor' : null;
        return;
      }
      const { session, space } = host;
      if (!session || !space || (!p.started && !dragged(event.screen, p.screen))) return;
      p.started = true;
      const editable = editableFrame(host, p.frame, p.key) ?? p.frame;
      const world = editable.world;
      const anchors = editable.path.anchors;
      if (p.kind === 'handle') {
        const local = toLocalPoint(world, event.doc);
        // Moving a handle with this tool makes the anchor a corner: the other handle stays put.
        session.run(setPathAnchors(space.id, editable.path.id, moveHandle(anchors, p.index, p.which, local, { alt: true, constrain: event.shiftKey }), p.key));
        return;
      }
      const anchor = anchors[p.index];
      if (!anchor) return;
      const pw = toWorldPoint(world, anchor.p);
      const d = event.shiftKey ? constrainTo45({ x: event.doc.x - pw.x, y: event.doc.y - pw.y }) : { x: event.doc.x - pw.x, y: event.doc.y - pw.y };
      const handle = toLocalPoint(world, { x: pw.x + d.x, y: pw.y + d.y });
      const next = anchors.slice();
      next[p.index] = smoothAnchor(anchor.p, handle);
      session.run(setPathAnchors(space.id, editable.path.id, next, p.key));
    },

    onPointerUp(_event, host) {
      const p = press;
      press = null;
      if (!p || p.started) return;
      const { session, space } = host;
      if (!session || !space || p.kind !== 'anchor') return;
      const editable = editableFrame(host, p.frame, p.key);
      const anchor = editable?.path.anchors[p.index];
      if (editable && anchor && (anchor.in || anchor.out)) session.run(setPathAnchors(space.id, editable.path.id, convertToCorner(editable.path.anchors, [p.index]), p.key));
    },

    onKey(key, host) {
      if (key === 'Escape' && press?.started) host.session?.rollback();
      if (key === 'Escape') press = null;
    },

    cancel(host) {
      if (press?.started) host.session?.rollback();
      press = null;
    },

    drawOverlay(ctx, host, theme) {
      drawAnchors(ctx, host, theme.accent, true);
    },
  };
}

/** Add Anchor Point (+): a click on a segment splits it without changing the curve. */
export function createAnchorAddTool(): Tool {
  let over = false;
  return {
    id: 'tool-anchor-add',
    cursor: () => penCursor(over ? 'add' : 'none'),
    onPointerDown(event, host) {
      const { session, space } = host;
      if (event.button !== 0 || !session || !space) return;
      const hit = segmentAt(host, candidates(host, event.doc), event.doc);
      if (!hit) return;
      const key = host.gestureKey();
      const editable = editableFrame(host, hit.frame, key);
      if (!editable) return;
      const inserted = insertAnchor(editable.path.anchors, editable.path.closed, hit.segment, hit.t);
      if (inserted.index < 0) return;
      session.run(setPathAnchors(space.id, editable.path.id, inserted.anchors, key), selectOnly(space.id, [editable.owner.id]));
    },
    onPointerMove(event, host) {
      const next = !!segmentAt(host, candidates(host, event.doc), event.doc) && !anchorAt(host, candidates(host, event.doc), event.doc);
      if (next !== over) {
        over = next;
        host.invalidateOverlay();
      }
    },
    onPointerUp() {},
    drawOverlay(ctx, host, theme) {
      drawAnchors(ctx, host, theme.accent, false);
    },
  };
}

/** Delete Anchor Point (−): removes the anchor; the neighbours keep their handles. A path left with fewer than two anchors disappears. */
export function createAnchorDeleteTool(): Tool {
  let over = false;
  return {
    id: 'tool-anchor-delete',
    cursor: () => penCursor(over ? 'delete' : 'none'),
    onPointerDown(event, host) {
      const { session, space } = host;
      if (event.button !== 0 || !session || !space) return;
      const hit = anchorAt(host, candidates(host, event.doc), event.doc);
      if (!hit) return;
      const key = host.gestureKey();
      const editable = editableFrame(host, hit.frame, key);
      if (!editable) return;
      const next = removeAnchors(editable.path.anchors, [hit.index]);
      if (next) session.run(setPathAnchors(space.id, editable.path.id, next, key), selectOnly(space.id, [editable.owner.id]));
      else session.run(removeNodes(space.id, [editable.owner.id]), emptySelection(space.id));
    },
    onPointerMove(event, host) {
      const next = !!anchorAt(host, candidates(host, event.doc), event.doc);
      if (next !== over) {
        over = next;
        host.invalidateOverlay();
      }
    },
    onPointerUp() {},
    drawOverlay(ctx, host, theme) {
      drawAnchors(ctx, host, theme.accent, false);
    },
  };
}

import {
  addAnchors,
  addToSelection,
  anchorsInRect,
  convertShapeToPath,
  emptySelection,
  moveAnchors,
  moveHandle,
  pathFrameOf,
  pathsOfNodes,
  projectOnSubPath,
  reshapeSpan,
  selectOnly,
  selectedAnchorIndices,
  setPathAnchors,
  toggleAnchor,
  transformNodes,
  translation,
  visibleLeafIds,
  withAnchors,
  snapPoint,
  type Anchor,
  type Matrix,
  type PathFrame,
  type Rect,
  type Selection,
  type Vec2,
} from '../../core';
import { t } from '../i18n';
import { constrainTo45 } from './boxGeometry';
import { createWidgetDrag } from './widgetDrag';
import { boxOf, currentSelection, dragged, selectedTopLevel, snapDelta } from './shared';
import type { CanvasPointerEvent, Tool, ToolHost, ToolKeyEvent } from './types';

const PICK_PX = 5;

type Action =
  | { type: 'handle'; frame: PathFrame; index: number; which: 'in' | 'out' }
  | { type: 'anchors'; primary: { frame: PathFrame; index: number }; wasSelected: boolean; shift: boolean }
  | { type: 'segment'; frame: PathFrame; segment: number; t: number }
  | { type: 'object'; id: string };

type State =
  | { kind: 'idle' }
  | { kind: 'press'; screen: Vec2; doc: Vec2; action: Action }
  | { kind: 'confirming'; released: boolean }
  | { kind: 'drag'; doc: Vec2; action: Action; key: string; originals: Map<string, { frame: PathFrame; anchors: Anchor[] }>; ids: string[]; bounds: Rect | null; applied: Vec2 }
  | { kind: 'marquee'; screen: Vec2; doc: Vec2; current: Vec2; shift: boolean };

/** World delta → local delta (the linear part of the inverse matrix; anchors live in the path's local space). */
function toLocalDelta(world: Matrix, d: Vec2): Vec2 {
  const det = world[0] * world[3] - world[1] * world[2];
  if (det === 0) return d;
  return { x: (world[3] * d.x - world[2] * d.y) / det, y: (-world[1] * d.x + world[0] * d.y) / det };
}

const toWorld = (world: Matrix, p: Vec2): Vec2 => ({ x: world[0] * p.x + world[2] * p.y + world[4], y: world[1] * p.x + world[3] * p.y + world[5] });
const toLocal = (world: Matrix, p: Vec2): Vec2 => {
  const det = world[0] * world[3] - world[1] * world[2];
  if (det === 0) return p;
  const x = p.x - world[4];
  const y = p.y - world[5];
  return { x: (world[3] * x - world[2] * y) / det, y: (-world[1] * x + world[0] * y) / det };
};

/** Frames of the paths of the selected objects (live shapes included, as read-only contours). */
function selectedFrames(host: ToolHost): PathFrame[] {
  const selection = currentSelection(host);
  return selection && host.space ? pathsOfNodes(host.space, selection.ids) : [];
}

/** Handles drawn for the selected anchors, and the neighbours' handles on the segments touching them. */
function visibleHandles(selection: Selection, frames: PathFrame[]): Array<{ frame: PathFrame; index: number; which: 'in' | 'out' }> {
  const out: Array<{ frame: PathFrame; index: number; which: 'in' | 'out' }> = [];
  for (const frame of frames) {
    const picked = selectedAnchorIndices(selection, frame.path.id);
    const n = frame.path.anchors.length;
    const seen = new Set<string>();
    const add = (index: number, which: 'in' | 'out') => {
      const key = `${index}:${which}`;
      if (seen.has(key) || index < 0 || index >= n) return;
      if (frame.path.anchors[index]?.[which]) {
        seen.add(key);
        out.push({ frame, index, which });
      }
    };
    for (const i of picked) {
      add(i, 'in');
      add(i, 'out');
      if (frame.path.closed || i > 0) add((i - 1 + n) % n, 'out');
      if (frame.path.closed || i < n - 1) add((i + 1) % n, 'in');
    }
  }
  return out;
}

/** Direct Selection (A): anchors, handles, segments, objects and marquee (specs/03 · Selección directa). */
export function createDirectSelectionTool(id: 'tool-direct-select' | 'tool-group-select' = 'tool-direct-select'): Tool {
  let state: State = { kind: 'idle' };
  const widgets = createWidgetDrag(true);

  const tolerance = (host: ToolHost) => PICK_PX / host.view.zoom;

  function hitHandle(host: ToolHost, p: Vec2) {
    const selection = currentSelection(host);
    if (!selection || !host.options.showHandles) return null;
    for (const h of visibleHandles(selection, selectedFrames(host))) {
      const handle = h.frame.path.anchors[h.index]?.[h.which];
      if (handle && Math.hypot(toWorld(h.frame.world, handle).x - p.x, toWorld(h.frame.world, handle).y - p.y) <= tolerance(host)) return h;
    }
    return null;
  }

  function hitAnchor(host: ToolHost, p: Vec2) {
    let best: { frame: PathFrame; index: number; distance: number } | null = null;
    for (const frame of selectedFrames(host)) {
      frame.path.anchors.forEach((a, index) => {
        const w = toWorld(frame.world, a.p);
        const distance = Math.hypot(w.x - p.x, w.y - p.y);
        if (distance <= tolerance(host) && (!best || distance < best.distance)) best = { frame, index, distance };
      });
    }
    return best as { frame: PathFrame; index: number; distance: number } | null;
  }

  /** The span of a path under the pointer (within pick distance), among the given frames. */
  function hitSegment(host: ToolHost, p: Vec2, frames: PathFrame[]) {
    let best: { frame: PathFrame; segment: number; t: number; distance: number } | null = null;
    for (const frame of frames) {
      const local = toLocal(frame.world, p);
      const hit = projectOnSubPath({ anchors: frame.path.anchors, closed: frame.path.closed }, local);
      if (!hit) continue;
      const scale = Math.sqrt(Math.abs(frame.world[0] * frame.world[3] - frame.world[1] * frame.world[2])) || 1;
      const distance = hit.distance * scale;
      if (distance <= tolerance(host) * 1.5 && (!best || distance < best.distance)) best = { frame, segment: hit.segmentIndex, t: hit.t, distance };
    }
    return best;
  }

  function selectAnchorsOf(host: ToolHost, frame: PathFrame, indices: number[], extend: boolean): void {
    const { session, space } = host;
    if (!session || !space) return;
    const base = extend ? (currentSelection(host) ?? emptySelection(space.id)) : emptySelection(space.id);
    const withOwner = base.ids.includes(frame.owner.id) ? base : { ...base, ids: [...base.ids, frame.owner.id] };
    session.select(extend ? addAnchors(withOwner, frame.path.id, indices) : withAnchors(withOwner, { [frame.path.id]: indices }));
  }

  /** Starts the drag of a press: snapshots the anchors involved and, for live shapes, asks to convert first. */
  async function beginDrag(event: CanvasPointerEvent, host: ToolHost, press: Extract<State, { kind: 'press' }>): Promise<void> {
    const { session, space } = host;
    if (!session || !space) {
      state = { kind: 'idle' };
      return;
    }
    const key = host.gestureKey();
    const action = press.action;

    if (action.type === 'object') {
      const ids = selectedTopLevel(host);
      state = { kind: 'drag', doc: press.doc, action, key, originals: new Map(), ids, bounds: boxOf(host, ids), applied: { x: 0, y: 0 } };
      drag(event, host, state);
      return;
    }

    const selection = currentSelection(host) ?? emptySelection(space.id);
    const frames = selectedFrames(host).filter((f) => {
      if (action.type === 'anchors') return selectedAnchorIndices(selection, f.path.id).length > 0;
      return f.path.id === action.frame.path.id;
    });
    const live = frames.filter((f) => f.live);
    if (live.length > 0) {
      state = { kind: 'confirming', released: false };
      const answer = await host.confirm({
        title: t('direct.convertTitle'),
        detail: t('direct.convertDetail'),
        buttons: [
          { id: 'cancel', label: t('dialog.cancel') },
          { id: 'convert', label: t('direct.convert'), variant: 'primary' },
        ],
      });
      const released = state.kind === 'confirming' && state.released;
      if (answer !== 'convert' || state.kind !== 'confirming') {
        state = { kind: 'idle' };
        return;
      }
      for (const f of live) session.run(convertShapeToPath(space.id, f.owner.id, key));
      if (released) {
        state = { kind: 'idle' };
        return;
      }
    }
    const originals = new Map<string, { frame: PathFrame; anchors: Anchor[] }>();
    const fresh = host.space ?? space;
    for (const f of frames) {
      const current = pathFrameOf(fresh, f.path.id);
      if (current) originals.set(f.path.id, { frame: current, anchors: current.path.anchors });
    }
    const relocatedAction: Action =
      action.type === 'handle' || action.type === 'segment'
        ? { ...action, frame: originals.get(action.frame.path.id)?.frame ?? action.frame }
        : action.type === 'anchors'
          ? { ...action, primary: { ...action.primary, frame: originals.get(action.primary.frame.path.id)?.frame ?? action.primary.frame } }
          : action;
    state = { kind: 'drag', doc: press.doc, action: relocatedAction, key, originals, ids: [], bounds: null, applied: { x: 0, y: 0 } };
    drag(event, host, state);
  }

  function drag(event: CanvasPointerEvent, host: ToolHost, s: Extract<State, { kind: 'drag' }>): void {
    const { session, space } = host;
    if (!session || !space) return;
    const action = s.action;
    let d: Vec2 = { x: event.doc.x - s.doc.x, y: event.doc.y - s.doc.y };

    if (action.type === 'object') {
      if (event.shiftKey) d = constrainTo45(d);
      if (s.bounds) d = snapDelta(host, s.bounds, d, new Set(s.ids));
      const step = { x: d.x - s.applied.x, y: d.y - s.applied.y };
      if (step.x === 0 && step.y === 0) return;
      session.run(transformNodes(space.id, s.ids, translation(step.x, step.y), s.key));
      s.applied = d;
      return;
    }

    if (action.type === 'handle') {
      const original = s.originals.get(action.frame.path.id);
      if (!original) return;
      const local = toLocal(original.frame.world, event.doc);
      const next = moveHandle(original.anchors, action.index, action.which, local, { alt: event.altKey, constrain: event.shiftKey });
      session.run(setPathAnchors(space.id, action.frame.path.id, next, s.key));
      return;
    }

    if (event.shiftKey) d = constrainTo45(d);
    if (action.type === 'anchors') {
      const primary = s.originals.get(action.primary.frame.path.id);
      if (primary) {
        // Snap the anchor under the pointer, so the whole selection follows the correction.
        const start = toWorld(primary.frame.world, primary.anchors[action.primary.index]?.p ?? { x: 0, y: 0 });
        const sources = host.snapSources(new Set([primary.frame.owner.id]));
        const hasSources = !!(sources.guides?.length || sources.grid || sources.artboards?.length || sources.objects);
        if (hasSources) {
          const snapped = snapPoint({ x: start.x + d.x, y: start.y + d.y }, sources, host.pickTolerance);
          host.setSnapLines(snapped.lines.length > 0 ? snapped.lines : null);
          d = { x: d.x + snapped.dx, y: d.y + snapped.dy };
        }
      }
      const selection = currentSelection(host) ?? emptySelection(space.id);
      for (const [pathId, { frame, anchors }] of s.originals) {
        const indices = selectedAnchorIndices(selection, pathId);
        session.run(setPathAnchors(space.id, pathId, moveAnchors(anchors, indices, toLocalDelta(frame.world, d)), s.key));
      }
      return;
    }

    // Segment reshape: the dragged curve point follows the pointer.
    const original = s.originals.get(action.frame.path.id);
    if (!original) return;
    const next = reshapeSpan(original.anchors, original.frame.path.closed, action.segment, action.t, toLocalDelta(original.frame.world, d));
    session.run(setPathAnchors(space.id, action.frame.path.id, next, s.key));
  }

  return {
    id,
    cursor: () => 'default',

    onPointerDown(event, host) {
      const { session, space } = host;
      if (!session || !space) return;
      const selection = currentSelection(host) ?? emptySelection(space.id);

      // 0. Corner and pie widgets.
      if (event.clickCount < 2 && widgets.press(event, host)) return;

      // 1. A handle of a selected anchor.
      const handle = hitHandle(host, event.doc);
      if (handle) {
        state = { kind: 'press', screen: event.screen, doc: event.doc, action: { type: 'handle', frame: handle.frame, index: handle.index, which: handle.which } };
        return;
      }

      // 2. An anchor of a selected object.
      const anchor = hitAnchor(host, event.doc);
      if (anchor) {
        const already = selectedAnchorIndices(selection, anchor.frame.path.id).includes(anchor.index);
        if (event.shiftKey) {
          const base = selection.ids.includes(anchor.frame.owner.id) ? selection : { ...selection, ids: [...selection.ids, anchor.frame.owner.id] };
          session.select(toggleAnchor(base, anchor.frame.path.id, anchor.index));
        } else if (!already) {
          selectAnchorsOf(host, anchor.frame, [anchor.index], false);
        }
        state = {
          kind: 'press',
          screen: event.screen,
          doc: event.doc,
          action: { type: 'anchors', primary: { frame: anchor.frame, index: anchor.index }, wasSelected: already, shift: event.shiftKey },
        };
        return;
      }

      // 3. A segment or the fill of an object.
      const hit = host.hitTest(event.doc)[0];
      if (hit) {
        const leafFrames = pathsOfNodes(space, [hit.node.id]);
        const segment = hit.part === 'stroke' || leafFrames.length > 0 ? hitSegment(host, event.doc, leafFrames) : null;
        if (segment) {
          const { frame } = segment;
          const n = frame.path.anchors.length;
          const a = segment.segment;
          const b = (segment.segment + 1) % n;
          selectAnchorsOf(host, frame, [a, b], event.shiftKey);
          state = { kind: 'press', screen: event.screen, doc: event.doc, action: { type: 'segment', frame, segment: segment.segment, t: segment.t } };
          return;
        }
        const leaf = hit.node;
        if (!selection.ids.includes(leaf.id) || event.shiftKey) {
          session.select(event.shiftKey ? addToSelection(selection, [leaf.id]) : selectOnly(space.id, [leaf.id]));
        }
        state = { kind: 'press', screen: event.screen, doc: event.doc, action: { type: 'object', id: leaf.id } };
        return;
      }

      // 4. Empty space: deselect everything (unless Shift) and start a marquee.
      if (!event.shiftKey) session.select(emptySelection(space.id));
      state = { kind: 'marquee', screen: event.screen, doc: event.doc, current: event.screen, shift: event.shiftKey };
    },

    onPointerMove(event, host) {
      if (widgets.move(event, host)) return;
      switch (state.kind) {
        case 'idle':
          host.setHover(host.hitAt(event.doc));
          break;
        case 'press':
          if (dragged(event.screen, state.screen)) void beginDrag(event, host, state);
          break;
        case 'drag':
          drag(event, host, state);
          break;
        case 'marquee':
          state.current = event.screen;
          host.invalidateOverlay();
          break;
        case 'confirming':
          break;
      }
    },

    onPointerUp(event, host) {
      if (widgets.release(event, host)) return;
      const { session, space } = host;
      const finished = state;
      host.setSnapLines(null);
      host.setMeasure(null);
      if (finished.kind === 'confirming') {
        finished.released = true; // keep the state until the dialog answers
        return;
      }
      state = { kind: 'idle' };
      if (!session || !space) return;

      if (finished.kind === 'press' && finished.action.type === 'anchors') {
        const { primary, wasSelected, shift } = finished.action;
        const selection = currentSelection(host);
        if (wasSelected && !shift && selection) selectAnchorsOf(host, primary.frame, [primary.index], false);
      } else if (finished.kind === 'marquee' && dragged(event.screen, finished.screen)) {
        const rect: Rect = {
          minX: Math.min(finished.doc.x, event.doc.x),
          minY: Math.min(finished.doc.y, event.doc.y),
          maxX: Math.max(finished.doc.x, event.doc.x),
          maxY: Math.max(finished.doc.y, event.doc.y),
        };
        const found = anchorsInRect(space, visibleLeafIds(space, rect), rect);
        const byPath: { [pathId: string]: number[] } = {};
        const owners: string[] = [];
        for (const a of found) {
          (byPath[a.pathId] ??= []).push(a.index);
          const owner = pathFrameOf(space, a.pathId)?.owner.id;
          if (owner && !owners.includes(owner)) owners.push(owner);
        }
        const base = finished.shift ? (currentSelection(host) ?? emptySelection(space.id)) : emptySelection(space.id);
        const merged: { [pathId: string]: number[] } = { ...(finished.shift ? base.anchors : {}) };
        for (const [pathId, list] of Object.entries(byPath)) merged[pathId] = [...(merged[pathId] ?? []), ...list];
        session.select(withAnchors({ ...base, ids: [...new Set([...base.ids, ...owners])] }, merged));
        host.invalidateOverlay();
      } else if (finished.kind === 'marquee') {
        host.invalidateOverlay();
      }
    },

    onKey(key, host) {
      if (key !== 'Escape') return;
      if (widgets.active) {
        widgets.cancel(host);
        host.invalidateOverlay();
        return;
      }
      if (state.kind === 'drag') host.session?.rollback();
      if (state.kind !== 'idle') {
        state = { kind: 'idle' };
        host.setSnapLines(null);
        host.invalidateOverlay();
      }
    },

    onKeyDown(event: ToolKeyEvent, host) {
      const { session, space } = host;
      const dirs: Record<string, Vec2> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
      const dir = dirs[event.key];
      if (!dir || !session || !space || event.ctrlKey || event.metaKey) return false;
      const selection = currentSelection(host);
      if (!selection) return false;
      const step = event.shiftKey ? 10 : 1;
      const d = { x: dir.x * step, y: dir.y * step };
      const frames = selectedFrames(host).filter((f) => selectedAnchorIndices(selection, f.path.id).length > 0);
      if (frames.length > 0) {
        if (frames.some((f) => f.live)) return false;
        for (const f of frames) {
          session.run(setPathAnchors(space.id, f.path.id, moveAnchors(f.path.anchors, selectedAnchorIndices(selection, f.path.id), toLocalDelta(f.world, d)), 'arrows-anchors'));
        }
        return true;
      }
      const ids = selectedTopLevel(host);
      if (ids.length === 0) return false;
      session.run(transformNodes(space.id, ids, translation(d.x, d.y), 'arrows'));
      return true;
    },

    onLeave(host) {
      if (state.kind === 'idle') host.setHover(null);
    },

    cancel(host) {
      widgets.cancel(host);
      if (state.kind === 'drag') host.session?.rollback();
      state = { kind: 'idle' };
      host.setSnapLines(null);
      host.setHover(null);
    },

    drawOverlay(ctx, host, theme) {
      widgets.draw(ctx, host, theme);
      const selection = currentSelection(host);
      if (selection && !host.options.hideEdges) {
        const frames = selectedFrames(host);
        const view = host.view;
        const screen = (frame: PathFrame, p: Vec2) => {
          const w = toWorld(frame.world, p);
          return { x: w.x * view.zoom + view.panX, y: w.y * view.zoom + view.panY };
        };
        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = theme.accent;
        for (const h of host.options.showHandles ? visibleHandles(selection, frames) : []) {
          const a = h.frame.path.anchors[h.index];
          const handle = a?.[h.which];
          if (!a || !handle) continue;
          const from = screen(h.frame, a.p);
          const to = screen(h.frame, handle);
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
          ctx.fillStyle = theme.accent;
          ctx.beginPath();
          ctx.arc(to.x, to.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const frame of frames) {
          const picked = new Set(selectedAnchorIndices(selection, frame.path.id));
          frame.path.anchors.forEach((a, i) => {
            const p = screen(frame, a.p);
            const x = Math.round(p.x) - 3;
            const y = Math.round(p.y) - 3;
            ctx.fillStyle = picked.has(i) ? theme.accent : '#ffffff';
            ctx.fillRect(x + 0.5, y + 0.5, 6, 6);
            ctx.strokeRect(x + 0.5, y + 0.5, 6, 6);
          });
        }
        ctx.restore();
      }
      if (state.kind === 'marquee' && dragged(state.current, state.screen)) {
        const r = { x: Math.min(state.screen.x, state.current.x), y: Math.min(state.screen.y, state.current.y), w: Math.abs(state.current.x - state.screen.x), h: Math.abs(state.current.y - state.screen.y) };
        ctx.save();
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = theme.accent;
        ctx.fillStyle = theme.accentSoft;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, r.w, r.h);
        ctx.restore();
      }
    },
  };
}


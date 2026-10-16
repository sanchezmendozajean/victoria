import {
  cloneNodes,
  duplicateNodes,
  emptySelection,
  locateNode,
  marqueeTargets,
  nodeWorldBounds,
  rectCenter,
  rotateAbout,
  scaleAbout,
  selectionTarget,
  selectOnly,
  toggleInSelection,
  transformNodes,
  transformNodesScaling,
  translation,
  rotation,
  multiply,
  addToSelection,
  isSelected,
  type Matrix,
  type Node,
  type Rect,
  type Vec2,
} from '../../core';
import { t } from '../i18n';
import { formatLength } from '../canvas/units';
import {
  angleBetween,
  constrainTo45,
  cursorForHandle,
  handleAt,
  handlePoints,
  rotateCornerAt,
  scaleFromHandle,
  snapAngle45,
  toScreenRect,
  type HandleId,
} from './boxGeometry';
import { boxOf, currentSelection, dragged, selectedTopLevel, snapDelta, stepBetween } from './shared';
import type { CanvasPointerEvent, Tool, ToolHost, ToolKeyEvent } from './types';
import { ROTATE_CURSOR } from './cursors';
import { createWidgetDrag } from './widgetDrag';
import { createTextWidgets } from './textWidgets';
import { boxScreenRect, cursorForTurnedHandle, fromBoxSpace, orientedBoxOf, rotatePoint, toBoxScreen, toBoxSpace, type OrientedBox } from './orientedBox';
import type { ToolId } from '../app/tools';

type State =
  | { kind: 'idle' }
  | { kind: 'press'; screen: Vec2; doc: Vec2; target: Node | null; wasSelected: boolean; shift: boolean; alt: boolean }
  | { kind: 'move'; doc: Vec2; ids: string[]; bounds: Rect; key: string; applied: Vec2; alt: boolean; duplicated: boolean }
  | { kind: 'scale'; handle: HandleId; box: OrientedBox; start: Vec2; ids: string[]; key: string; applied: Matrix }
  | { kind: 'rotate'; center: Vec2; start: Vec2; ids: string[]; key: string; applied: Matrix; angle: number; baseTheta: number }
  | { kind: 'marquee'; screen: Vec2; doc: Vec2; current: Vec2; shift: boolean };

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const ARROW_STEP = 1;
const ARROW_STEP_SHIFT = 10;

/** Selection (V): click, Shift+click, marquee, move (Alt duplicates, Shift constrains), box scale/rotate, arrows, isolation. */
export function createSelectionTool(id: ToolId = 'tool-select'): Tool {
  let state: State = { kind: 'idle' };
  const widgets = createWidgetDrag(false);
  const textWidgets = createTextWidgets();
  let hoverCursor = 'default';
  /** Several objects rotated together keep their turned box until the selection changes (as in Illustrator). */
  let sticky: { key: string; theta: number } | null = null;
  const idsKey = (ids: readonly string[]) => [...ids].sort().join('|');

  /** The oriented box of the current selection (turning live while a rotation drags several objects). */
  const boxFor = (host: ToolHost, ids: string[]): OrientedBox | null => {
    if (!host.space) return null;
    let theta = sticky && sticky.key === idsKey(ids) ? sticky.theta : 0;
    if (state.kind === 'rotate' && ids.length > 1) theta = state.baseTheta + state.angle;
    return orientedBoxOf(host.space, ids, theta);
  };

  const size = (r: Rect, units: Parameters<typeof formatLength>[1]) => `${t('measure.width')}: ${formatLength(r.maxX - r.minX, units)}  ${t('measure.height')}: ${formatLength(r.maxY - r.minY, units)}`;


  function startMove(host: ToolHost, press: Extract<State, { kind: 'press' }>): void {
    const ids = selectedTopLevel(host);
    const bounds = boxOf(host, ids);
    if (!bounds || ids.length === 0) {
      state = { kind: 'idle' };
      return;
    }
    state = { kind: 'move', doc: press.doc, ids, bounds, key: host.gestureKey(), applied: { x: 0, y: 0 }, alt: press.alt, duplicated: false };
  }

  function move(event: CanvasPointerEvent, host: ToolHost, s: Extract<State, { kind: 'move' }>): void {
    const { session, space } = host;
    if (!session || !space) return;
    let delta: Vec2 = { x: event.doc.x - s.doc.x, y: event.doc.y - s.doc.y };
    if (event.shiftKey) delta = constrainTo45(delta);
    delta = snapDelta(host, s.bounds, delta, new Set(s.ids));
    const step = { x: delta.x - s.applied.x, y: delta.y - s.applied.y };
    if (step.x === 0 && step.y === 0 && s.duplicated === s.alt) return;

    if (s.alt && !s.duplicated) {
      // Alt+drag: copies stay above their originals and take the move; the originals stay put.
      const nodes = s.ids.map((id) => locateNode(space, id)?.node).filter((n): n is Node => !!n);
      const clones = cloneNodes(nodes, session.ids);
      session.run(duplicateNodes(space.id, s.ids, clones, translation(delta.x, delta.y), `${s.key}`), selectOnly(space.id, clones.map((c) => c.id)));
      s.ids = clones.map((c) => c.id);
      s.duplicated = true;
    } else {
      session.run(transformNodes(space.id, s.ids, translation(step.x, step.y), s.key));
    }
    s.applied = delta;
    host.setMeasure(`Δx: ${formatLength(delta.x, host.units)}  Δy: ${formatLength(delta.y, host.units)}`, event.screen);
  }

  function transformStep(host: ToolHost, ids: string[], key: string, next: Matrix, applied: Matrix): void {
    const { session, space } = host;
    if (!session || !space) return;
    session.run(transformNodesScaling(space.id, ids, stepBetween(next, applied), host.scaleStrokes, key));
  }

  function scale(event: CanvasPointerEvent, host: ToolHost, s: Extract<State, { kind: 'scale' }>): void {
    // Everything is computed in the box's own (turned) space, then turned back.
    const { sx, sy, pivot } = scaleFromHandle(s.box.rect, s.handle, toBoxSpace(s.box, s.start), toBoxSpace(s.box, event.doc), { proportional: event.shiftKey, fromCenter: event.altKey });
    const clamp = (v: number) => (Math.abs(v) < 0.001 ? (v < 0 ? -0.001 : 0.001) : v);
    const next = multiply(rotation(s.box.theta), multiply(scaleAbout(clamp(sx), clamp(sy), pivot), rotation(-s.box.theta)));
    transformStep(host, s.ids, s.key, next, s.applied);
    s.applied = next;
    host.setMeasure(size({ minX: 0, minY: 0, maxX: Math.abs((s.box.rect.maxX - s.box.rect.minX) * sx), maxY: Math.abs((s.box.rect.maxY - s.box.rect.minY) * sy) }, host.units), event.screen);
  }

  function rotate(event: CanvasPointerEvent, host: ToolHost, s: Extract<State, { kind: 'rotate' }>): void {
    let angle = angleBetween(s.center, s.start, event.doc);
    if (event.shiftKey) angle = snapAngle45(angle);
    const next = rotateAbout(angle, s.center);
    transformStep(host, s.ids, s.key, next, s.applied);
    s.applied = next;
    s.angle = angle;
    host.setMeasure(`${Math.round(-angle * (180 / Math.PI) * 100) / 100}°`, event.screen);
  }

  /** Double click: enter isolation on a group, or leave it by double-clicking outside. */
  function doubleClick(event: CanvasPointerEvent, host: ToolHost): boolean {
    const { session, space } = host;
    if (!session || !space) return false;
    const hit = host.hitTest(event.doc)[0];
    if (!hit) {
      if (host.isolation) {
        host.setIsolation(null);
        return true;
      }
      return false;
    }
    const target = selectionTarget(hit, host.isolation);
    if (!target) {
      if (host.isolation) host.setIsolation(null);
      return true;
    }
    if (target.type === 'text') {
      session.select(selectOnly(space.id, [target.id]));
      host.requestTextEdit({ id: target.id, at: event.doc });
      host.switchTool('tool-type');
      return true;
    }
    if (target.type === 'group' || target.type === 'clipGroup') {
      host.setIsolation(target.id);
      const inner = selectionTarget(hit, target.id);
      session.select(selectOnly(space.id, inner ? [inner.id] : []));
      return true;
    }
    return false;
  }

  function updateHover(event: CanvasPointerEvent, host: ToolHost): void {
    const ids = selectedTopLevel(host);
    const box = boxFor(host, ids);
    hoverCursor = 'default';
    if (widgets.hover(event.doc, host) || textWidgets.hover(event.doc, host)) {
      hoverCursor = 'pointer';
      host.setHover(null);
      return;
    }
    if (box && !host.options.hideEdges) {
      const sbox = boxScreenRect(box, host.view);
      const pointer = toBoxScreen(box, event.screen);
      const handle = handleAt(sbox, pointer);
      if (handle) hoverCursor = cursorForTurnedHandle(handle, box.theta);
      else if (rotateCornerAt(sbox, pointer)) hoverCursor = ROTATE_CURSOR;
    }
    host.setHover(hoverCursor === 'default' ? host.hitAt(event.doc) : null);
  }

  return {
    id,
    cursor: () => (state.kind === 'move' ? 'move' : state.kind === 'rotate' ? ROTATE_CURSOR : state.kind === 'scale' ? cursorForHandle(state.handle) : hoverCursor),

    onPointerDown(event, host) {
      const { session, space } = host;
      if (!session || !space) return;
      const selection = currentSelection(host) ?? emptySelection(space.id);

      // 0. Corner and pie widgets of live shapes.
      if (event.clickCount < 2 && (widgets.press(event, host) || textWidgets.press(event, host))) return;
      if (event.clickCount >= 2 && textWidgets.doubleClick(event, host)) {
        state = { kind: 'idle' };
        return;
      }

      // 1. Bounding box handles (scale) and the rotate zone just outside the corners.
      const ids = selectedTopLevel(host);
      const box = boxFor(host, ids);
      if (box && !host.options.hideEdges && event.clickCount < 2) {
        const sbox = boxScreenRect(box, host.view);
        const pointer = toBoxScreen(box, event.screen);
        const handle = handleAt(sbox, pointer);
        if (handle) {
          state = { kind: 'scale', handle, box, start: event.doc, ids, key: host.gestureKey(), applied: IDENTITY };
          return;
        }
        if (rotateCornerAt(sbox, pointer)) {
          state = { kind: 'rotate', center: fromBoxSpace(box, rectCenter(box.rect)), start: event.doc, ids, key: host.gestureKey(), applied: IDENTITY, angle: 0, baseTheta: box.theta };
          return;
        }
      }

      if (event.clickCount >= 2 && doubleClick(event, host)) {
        state = { kind: 'idle' };
        return;
      }

      // 2. An object: select it (Shift toggles) and prepare to move.
      const hit = host.hitTest(event.doc)[0];
      const target = hit ? selectionTarget(hit, host.isolation) : null;
      // Align › objeto clave: a click on one of several selected objects marks it as the key object.
      if (target && host.keyObjectMode && !event.shiftKey && isSelected(selection, target.id) && selection.ids.length > 1) {
        host.setKeyObject(target.id);
        host.invalidateOverlay();
        return;
      }
      if (target) {
        if (event.shiftKey) {
          const next = toggleInSelection(selection, target.id);
          session.select(next);
          state = { kind: 'press', screen: event.screen, doc: event.doc, target, wasSelected: isSelected(next, target.id), shift: true, alt: event.altKey };
        } else if (!isSelected(selection, target.id)) {
          session.select(selectOnly(space.id, [target.id]));
          state = { kind: 'press', screen: event.screen, doc: event.doc, target, wasSelected: false, shift: false, alt: event.altKey };
        } else {
          state = { kind: 'press', screen: event.screen, doc: event.doc, target, wasSelected: true, shift: false, alt: event.altKey };
        }
        return;
      }

      // 3. Empty space: deselect (unless Shift) and start a marquee.
      if (!event.shiftKey) session.select(emptySelection(space.id));
      state = { kind: 'marquee', screen: event.screen, doc: event.doc, current: event.screen, shift: event.shiftKey };
    },

    onPointerMove(event, host) {
      if (widgets.move(event, host) || textWidgets.move(event, host)) return;
      switch (state.kind) {
        case 'idle':
          updateHover(event, host);
          break;
        case 'press':
          if (dragged(event.screen, state.screen)) {
            if (state.shift && !state.wasSelected) {
              state = { kind: 'idle' }; // Shift+click removed it: nothing to drag
              break;
            }
            startMove(host, state);
            const started = state as State;
            if (started.kind === 'move') move(event, host, started);
          }
          break;
        case 'move':
          move(event, host, state);
          break;
        case 'scale':
          scale(event, host, state);
          break;
        case 'rotate':
          rotate(event, host, state);
          break;
        case 'marquee':
          state.current = event.screen;
          host.invalidateOverlay();
          break;
      }
    },

    onPointerUp(event, host) {
      if (widgets.release(event, host) || textWidgets.release(event, host)) return;
      const { session, space } = host;
      const finished = state;
      state = { kind: 'idle' };
      host.setSnapLines(null);
      host.setMeasure(null);
      if (!session || !space) return;

      if (finished.kind === 'press') {
        // A plain click on one of several selected objects narrows the selection to it.
        const selection = currentSelection(host);
        if (finished.wasSelected && !finished.shift && finished.target && selection && selection.ids.length > 1) {
          session.select(selectOnly(space.id, [finished.target.id]));
        }
      } else if (finished.kind === 'move') {
        host.rememberTransform({ matrix: translation(finished.applied.x, finished.applied.y), copy: finished.duplicated });
      } else if (finished.kind === 'scale' || finished.kind === 'rotate') {
        host.rememberTransform({ matrix: finished.applied, copy: false });
        if (finished.kind === 'rotate' && finished.ids.length > 1) sticky = { key: idsKey(finished.ids), theta: finished.baseTheta + finished.angle };
      } else if (finished.kind === 'marquee') {
        if (dragged(event.screen, finished.screen)) {
          const rect: Rect = {
            minX: Math.min(finished.doc.x, event.doc.x),
            minY: Math.min(finished.doc.y, event.doc.y),
            maxX: Math.max(finished.doc.x, event.doc.x),
            maxY: Math.max(finished.doc.y, event.doc.y),
          };
          const found = marqueeTargets(space, rect, { isolation: host.isolation, tolerance: host.pickTolerance }).map((n) => n.id);
          const base = currentSelection(host) ?? emptySelection(space.id);
          session.select(finished.shift ? addToSelection(base, found) : selectOnly(space.id, found));
        }
        host.invalidateOverlay();
      }
    },

    onKey(key, host) {
      if (key !== 'Escape') return;
      if (widgets.active || textWidgets.active) {
        widgets.cancel(host);
        textWidgets.cancel(host);
        host.invalidateOverlay();
        return;
      }
      const s = state;
      if (s.kind === 'move' || s.kind === 'scale' || s.kind === 'rotate') {
        host.session?.rollback();
      }
      if (s.kind !== 'idle') {
        state = { kind: 'idle' };
        host.setSnapLines(null);
        host.setMeasure(null);
        host.invalidateOverlay();
      } else if (host.isolation) {
        host.setIsolation(null);
      }
    },

    onKeyDown(event: ToolKeyEvent, host) {
      const { session, space } = host;
      const arrows: Record<string, Vec2> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
      const dir = arrows[event.key];
      if (!dir || !session || !space || event.ctrlKey || event.metaKey) return false;
      const ids = selectedTopLevel(host);
      if (ids.length === 0) return false;
      const step = event.shiftKey ? ARROW_STEP_SHIFT : ARROW_STEP;
      session.run(transformNodes(space.id, ids, translation(dir.x * step, dir.y * step), 'arrows'));
      return true;
    },

    onLeave(host) {
      if (state.kind === 'idle') host.setHover(null);
    },

    cancel(host) {
      widgets.cancel(host);
      textWidgets.cancel(host);
      if (state.kind === 'move' || state.kind === 'scale' || state.kind === 'rotate') host.session?.rollback();
      state = { kind: 'idle' };
      host.setSnapLines(null);
      host.setMeasure(null);
      host.setHover(null);
    },

    drawOverlay(ctx, host, theme) {
      widgets.draw(ctx, host, theme);
      textWidgets.draw(ctx, host, theme);
      if (host.keyObjectMode && host.keyObject && host.space) {
        const rect = nodeWorldBounds(host.space, host.keyObject);
        if (rect) {
          const s = toScreenRect(rect, host.view.zoom, host.view.panX, host.view.panY);
          ctx.save();
          ctx.lineWidth = 3;
          ctx.strokeStyle = theme.accent;
          ctx.strokeRect(s.minX, s.minY, s.maxX - s.minX, s.maxY - s.minY);
          ctx.restore();
        }
      }
      const ids = selectedTopLevel(host);
      const box = boxFor(host, ids);
      if (box && !host.options.hideEdges) {
        const s = boxScreenRect(box, host.view);
        const corners = [
          { x: s.minX, y: s.minY },
          { x: s.maxX, y: s.minY },
          { x: s.maxX, y: s.maxY },
          { x: s.minX, y: s.maxY },
        ].map((p) => rotatePoint(p, box.theta));
        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = theme.accent;
        ctx.beginPath();
        corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (const h of Object.values(handlePoints(s))) {
          const p = rotatePoint(h, box.theta);
          const x = Math.round(p.x) - 3;
          const y = Math.round(p.y) - 3;
          ctx.fillRect(x + 0.5, y + 0.5, 7, 7);
          ctx.strokeRect(x + 0.5, y + 0.5, 7, 7);
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


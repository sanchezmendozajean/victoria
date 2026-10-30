import {
  addArtboard,
  combineCommands,
  createArtboard,
  nodeWorldBounds,
  removeArtboard,
  transformNodes,
  translation,
  updateArtboard,
  type Artboard,
  type Command,
  type Space,
  type Vec2,
} from '../../core';
import { useUi } from '../app/store';
import { t } from '../i18n';
import { HANDLE_IDS, type HandleId } from './boxGeometry';
import type { Tool, ToolHost } from './types';

const GRAB = 7; // screen px
const SQUARE = 6;
const MIN_SIZE = 1; // pt
const MIN_NEW = 4; // screen px: smaller drags are clicks

const CURSORS: Record<HandleId, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

type Rect = Pick<Artboard, 'x' | 'y' | 'w' | 'h'>;

function spots(r: Rect): Record<HandleId, Vec2> {
  const { x, y, w, h } = r;
  return {
    nw: { x, y },
    n: { x: x + w / 2, y },
    ne: { x: x + w, y },
    e: { x: x + w, y: y + h / 2 },
    se: { x: x + w, y: y + h },
    s: { x: x + w / 2, y: y + h },
    sw: { x, y: y + h },
    w: { x, y: y + h / 2 },
  };
}

/** The rectangle after pulling `handle` to `p` (Shift keeps the proportions of the starting one). */
export function resizeRect(start: Rect, handle: HandleId, p: Vec2, keepRatio: boolean): Rect {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;
  if (handle.includes('w')) left = Math.min(p.x, right - MIN_SIZE);
  if (handle.includes('e')) right = Math.max(p.x, left + MIN_SIZE);
  if (handle.includes('n')) top = Math.min(p.y, bottom - MIN_SIZE);
  if (handle.includes('s')) bottom = Math.max(p.y, top + MIN_SIZE);
  if (keepRatio && handle.length === 2) {
    const ratio = start.w / start.h;
    const w = right - left;
    const h = bottom - top;
    const scale = Math.max(w / start.w, h / start.h);
    const nw = start.w * scale;
    const nh = nw / ratio;
    if (handle.includes('w')) left = right - nw;
    else right = left + nw;
    if (handle.includes('n')) top = bottom - nh;
    else bottom = top + nh;
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

const toScreen = (host: ToolHost, p: Vec2): Vec2 => ({ x: p.x * host.view.zoom + host.view.panX, y: p.y * host.view.zoom + host.view.panY });

function activeBoard(host: ToolHost): Artboard | null {
  const space = host.space;
  if (!space) return null;
  const id = useUi.getState().activeArtboard[space.id];
  return space.artboards.find((a) => a.id === id) ?? space.artboards[0] ?? null;
}

function handleUnder(host: ToolHost, board: Artboard, screen: Vec2): HandleId | null {
  const all = spots(board);
  for (const id of HANDLE_IDS) {
    const p = toScreen(host, all[id]);
    if (Math.abs(p.x - screen.x) <= GRAB && Math.abs(p.y - screen.y) <= GRAB) return id;
  }
  return null;
}

function boardAt(space: Space, p: Vec2): Artboard | null {
  for (let i = space.artboards.length - 1; i >= 0; i--) {
    const a = space.artboards[i] as Artboard;
    if (p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h) return a;
  }
  return null;
}

/** Top-level objects whose centre lies on the artboard: they travel with it. */
function contentOf(space: Space, board: Rect): string[] {
  const ids: string[] = [];
  for (const layer of space.layers) {
    if (layer.locked || !layer.visible) continue;
    for (const node of layer.children) {
      const b = nodeWorldBounds(space, node.id);
      if (!b) continue;
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      if (cx >= board.x && cx <= board.x + board.w && cy >= board.y && cy <= board.y + board.h) ids.push(node.id);
    }
  }
  return ids;
}

type State =
  | { kind: 'move'; id: string; start: Rect; from: Vec2; content: string[]; applied: Vec2; key: string }
  | { kind: 'resize'; id: string; handle: HandleId; start: Rect; key: string }
  | { kind: 'create'; id: string; from: Vec2; fromScreen: Vec2; key: string }
  | null;

/** The next free name "Mesa n". */
const nextName = (space: Space) => t('doc.defaultArtboard', { n: space.artboards.length + 1 });

/**
 * Mesa de trabajo (Mayús+O): drag on empty canvas draws a new artboard, a click activates one, handles resize the
 * active one, dragging inside moves it with the artwork on it (Alt copies the artboard), Delete removes it, Escape leaves.
 */
export function createArtboardTool(): Tool {
  let state: State = null;
  let hover: string | null = null;

  return {
    id: 'tool-artboard',
    cursor: () => hover ?? 'crosshair',

    onPointerDown(event, host) {
      const { session, space } = host;
      if (!session || !space || event.button !== 0) return;
      const ui = useUi.getState();
      const current = activeBoard(host);
      const handle = current ? handleUnder(host, current, event.screen) : null;
      if (current && handle) {
        state = { kind: 'resize', id: current.id, handle, start: { x: current.x, y: current.y, w: current.w, h: current.h }, key: host.gestureKey() };
        return;
      }
      const hit = boardAt(space, event.doc);
      if (hit) {
        ui.setActiveArtboard(space.id, hit.id);
        let target = hit;
        if (event.altKey) {
          const copy = createArtboard(session.ids, { name: nextName(space), x: hit.x, y: hit.y, w: hit.w, h: hit.h, ...(hit.preset !== undefined ? { preset: hit.preset } : {}) });
          session.run(addArtboard(space.id, copy));
          ui.setActiveArtboard(space.id, copy.id);
          target = copy;
        }
        const start = { x: target.x, y: target.y, w: target.w, h: target.h };
        // The copy leaves the artwork where it is; a plain move carries it.
        state = { kind: 'move', id: target.id, start, from: event.doc, content: event.altKey ? [] : contentOf(space, start), applied: { x: 0, y: 0 }, key: host.gestureKey() };
        host.invalidateOverlay();
        return;
      }
      state = { kind: 'create', id: '', from: event.doc, fromScreen: event.screen, key: host.gestureKey() };
    },

    onPointerMove(event, host) {
      const { session, space } = host;
      if (!session || !space) return;
      if (!state) {
        const current = activeBoard(host);
        const over = current ? handleUnder(host, current, event.screen) : null;
        hover = over ? CURSORS[over] : boardAt(space, event.doc) ? 'move' : null;
        return;
      }
      if (state.kind === 'resize') {
        const next = resizeRect(state.start, state.handle, event.doc, event.shiftKey);
        session.run(updateArtboard(space.id, state.id, next, state.key));
      } else if (state.kind === 'move') {
        const dx = event.doc.x - state.from.x;
        const dy = event.doc.y - state.from.y;
        const commands: Command[] = [updateArtboard(space.id, state.id, { x: state.start.x + dx, y: state.start.y + dy }, state.key)];
        const step = { x: dx - state.applied.x, y: dy - state.applied.y };
        if (state.content.length > 0 && (step.x !== 0 || step.y !== 0)) commands.push(transformNodes(space.id, state.content, translation(step.x, step.y)));
        session.run(combineCommands('artboard.update', commands));
        state.applied = { x: dx, y: dy };
      } else {
        const dragged = Math.hypot(event.screen.x - state.fromScreen.x, event.screen.y - state.fromScreen.y) >= MIN_NEW;
        if (!dragged && !state.id) return;
        const x = Math.min(state.from.x, event.doc.x);
        const y = Math.min(state.from.y, event.doc.y);
        const w = Math.max(MIN_SIZE, Math.abs(event.doc.x - state.from.x));
        const h = Math.max(MIN_SIZE, Math.abs(event.doc.y - state.from.y));
        if (!state.id) {
          const board = createArtboard(session.ids, { name: nextName(space), x, y, w, h });
          session.run(addArtboard(space.id, board));
          state.id = board.id;
          useUi.getState().setActiveArtboard(space.id, board.id);
        } else {
          session.run(updateArtboard(space.id, state.id, { x, y, w, h }, state.key));
        }
      }
      host.invalidateOverlay();
    },

    onPointerUp(_event, host) {
      state = null;
      host.invalidateOverlay();
    },

    onKey(key, host) {
      if (key === 'Escape') {
        if (state) host.session?.rollback();
        state = null;
        host.switchTool('tool-select');
      }
    },

    onKeyDown(event, host) {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return false;
      const { session, space } = host;
      const board = activeBoard(host);
      if (!session || !space || !board || space.artboards.length <= 1) return false;
      session.run(removeArtboard(space.id, board.id));
      useUi.getState().setActiveArtboard(space.id, space.artboards.find((a) => a.id !== board.id)?.id ?? '');
      host.invalidateOverlay();
      return true;
    },

    cancel(host) {
      if (state) host.session?.rollback();
      state = null;
    },

    drawOverlay(ctx, host, theme) {
      const board = activeBoard(host);
      if (!board) return;
      const a = toScreen(host, { x: board.x, y: board.y });
      const b = toScreen(host, { x: board.x + board.w, y: board.y + board.h });
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = theme.accent;
      ctx.fillStyle = '#ffffff';
      ctx.strokeRect(Math.floor(a.x) + 0.5, Math.floor(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
      for (const id of HANDLE_IDS) {
        const p = toScreen(host, spots(board)[id]);
        ctx.fillRect(Math.floor(p.x) - SQUARE / 2 + 0.5, Math.floor(p.y) - SQUARE / 2 + 0.5, SQUARE, SQUARE);
        ctx.strokeRect(Math.floor(p.x) - SQUARE / 2 + 0.5, Math.floor(p.y) - SQUARE / 2 + 0.5, SQUARE, SQUARE);
      }
      ctx.restore();
    },
  };
}

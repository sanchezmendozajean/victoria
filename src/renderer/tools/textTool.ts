import {
  addNode,
  caretAt,
  commonStyle,
  createText,
  emptySelection,
  frameOf,
  indexAt,
  insertText,
  invert,
  paragraphRangeAt,
  pathFrameOf,
  plainText,
  projectOnSubPath,
  removeNodes,
  replaceNode,
  replaceRange,
  selectOnly,
  setTextContent,
  sliceStory,
  styleText,
  textGeometry,
  translation,
  wordAt,
  worldToLocal,
  type Anchor,
  type Matrix,
  type TextNode,
  type TextPath,
  type TextRun,
  type TextStyle,
  type Vec2,
} from '../../core';
import type { ToolId } from '../app/tools';
import { dragged, snapTo } from './shared';
import type { CanvasPointerEvent, Tool, ToolHost, ToolKeyEvent } from './types';

/** Copy/paste of text inside the app keeps its styles (outside the app only plain text travels). */
let clipboard: { text: string; runs: TextRun[] } | null = null;

const BLINK_MS = 530;
const MIN_FRAME = 4;

export type TextToolMode = 'point' | 'area' | 'onPath';

interface Pending {
  /** What the first typed character creates. */
  kind: 'point' | 'area' | 'onPath';
  /** Document position (point text: the baseline start; area text: the frame's top-left corner). */
  at: Vec2;
  frameSize?: { w: number; h: number };
  /** An existing path that becomes the frame or the line (it is replaced by the text object). */
  source?: { id: string; transform: Matrix; anchors: Anchor[]; closed: boolean; startFraction?: number };
}

interface Edit {
  id: string;
  /** Selection: `anchor` is where it started, `caret` where it is now (they are equal when collapsed). */
  anchor: number;
  caret: number;
  /** Key that folds a burst of typing into one undo step; changes when the caret moves. */
  burst: string;
  /** Column (local x) kept while moving up and down. */
  column: number | null;
}

type State =
  | { kind: 'idle' }
  | { kind: 'create'; screen: Vec2; doc: Vec2; pending: Pending }
  | { kind: 'select'; id: string; fromIndex: number };

const rotate = (m: Matrix, p: Vec2): Vec2 => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

/** Caret movement over a laid-out text (pure, so it can be tested without a canvas). */
export function moveCaret(layout: ReturnType<typeof textGeometry>['layout'], text: string, caret: number, key: string, ctrl: boolean, column: number | null): { caret: number; column: number | null } {
  if (!layout) return { caret, column };
  const stop = (from: number, dir: 1 | -1): number => {
    if (!ctrl) return Math.max(0, Math.min(text.length, from + dir));
    let i = from;
    if (dir > 0) {
      while (i < text.length && /\s/.test(text[i] as string)) i++;
      while (i < text.length && !/\s/.test(text[i] as string)) i++;
    } else {
      while (i > 0 && /\s/.test(text[i - 1] as string)) i--;
      while (i > 0 && !/\s/.test(text[i - 1] as string)) i--;
    }
    return i;
  };
  switch (key) {
    case 'ArrowLeft':
      return { caret: stop(caret, -1), column: null };
    case 'ArrowRight':
      return { caret: stop(caret, 1), column: null };
    case 'Home': {
      if (ctrl) return { caret: 0, column: null };
      const c = caretAt(layout, caret);
      return { caret: layout.lines[c.line]?.start ?? 0, column: null };
    }
    case 'End': {
      if (ctrl) return { caret: text.length, column: null };
      const c = caretAt(layout, caret);
      return { caret: layout.lines[c.line]?.end ?? text.length, column: null };
    }
    case 'ArrowUp':
    case 'ArrowDown': {
      const c = caretAt(layout, caret);
      const x = column ?? c.x;
      const target = layout.lines[c.line + (key === 'ArrowUp' ? -1 : 1)];
      if (!target) return { caret: key === 'ArrowUp' ? 0 : text.length, column: x };
      return { caret: indexAt(layout, { x, y: target.y }), column: x };
    }
    default:
      return { caret, column };
  }
}

/**
 * Type (T), Area Type and Type on a Path (specs/03 · Texto, specs/07). A click makes point text, a drag
 * area text, a click on a closed path area text inside it and a click on an open path text on it.
 * Typing arrives through the canvas's hidden input; the object is created with the first character.
 */
export function createTextTool(id: ToolId, mode: TextToolMode): Tool {
  let state: State = { kind: 'idle' };
  let editing: Edit | null = null;
  let pending: Pending | null = null;
  let blinkOn = true;
  let blinkTimer: ReturnType<typeof setInterval> | undefined;
  let pointer: Vec2 | null = null;
  let host_: ToolHost | null = null;

  const space = (host: ToolHost) => host.space;
  const nodeOf = (host: ToolHost, nodeId: string): { node: TextNode; world: Matrix } | null => {
    const sp = space(host);
    const frame = sp ? frameOf(sp, nodeId) : null;
    return frame && frame.node.type === 'text' ? { node: frame.node, world: frame.world } : null;
  };

  function startBlink(host: ToolHost): void {
    host_ = host;
    blinkOn = true;
    if (blinkTimer) clearInterval(blinkTimer);
    blinkTimer = setInterval(() => {
      blinkOn = !blinkOn;
      host_?.invalidateOverlay();
    }, BLINK_MS);
  }
  function stopBlink(): void {
    if (blinkTimer) clearInterval(blinkTimer);
    blinkTimer = undefined;
  }

  /** The caret position on screen, so the hidden input (and IME windows) sit next to it. */
  function placeInput(host: ToolHost): void {
    if (editing) {
      const n = nodeOf(host, editing.id);
      if (n) {
        const layout = textGeometry(n.node).layout;
        const c = layout ? caretAt(layout, editing.caret) : { x: 0, y: 0, height: 12 };
        const p = rotate(n.world, { x: c.x, y: c.y + c.height });
        host.setTextInput({ active: true, at: { x: p.x * host.view.zoom + host.view.panX, y: p.y * host.view.zoom + host.view.panY } });
        return;
      }
    }
    if (pending) host.setTextInput({ active: true, at: { x: pending.at.x * host.view.zoom + host.view.panX, y: pending.at.y * host.view.zoom + host.view.panY } });
  }

  function report(host: ToolHost): void {
    if (editing) host.reportTextEditing({ id: editing.id, from: Math.min(editing.anchor, editing.caret), to: Math.max(editing.anchor, editing.caret) });
    else host.reportTextEditing(null);
    host.invalidateOverlay();
  }

  const clamp = (host: ToolHost) => {
    if (!editing) return null;
    const n = nodeOf(host, editing.id);
    if (!n) {
      editing = null;
      return null;
    }
    const len = plainText(n.node.story).length;
    editing.anchor = Math.max(0, Math.min(len, editing.anchor));
    editing.caret = Math.max(0, Math.min(len, editing.caret));
    return n;
  };

  function begin(host: ToolHost, nodeId: string, caret: number, anchor = caret): void {
    editing = { id: nodeId, anchor, caret, burst: host.gestureKey(), column: null };
    pending = null;
    state = { kind: 'idle' };
    startBlink(host);
    host.session?.select(selectOnly(host.space?.id ?? '', [nodeId]));
    host.setTextInput({ active: true });
    placeInput(host);
    report(host);
  }

  /** Leaves editing: an emptied text object is deleted (Illustrator does the same). */
  function finish(host: ToolHost): void {
    const e = editing;
    editing = null;
    pending = null;
    state = { kind: 'idle' };
    stopBlink();
    host.setTextInput({ active: false });
    host.reportTextEditing(null);
    if (e) {
      const n = nodeOf(host, e.id);
      const sp = host.space;
      if (n && sp && plainText(n.node.story) === '') {
        host.session?.run(removeNodes(sp.id, [e.id]), emptySelection(sp.id));
      }
    }
    host.invalidateOverlay();
  }

  const styleAtIndex = (node: TextNode, index: number): TextStyle => {
    const probe = insertText(node.story, index, '\u0000');
    const at = probe.find((r) => r.text.includes('\u0000'));
    return at ? { ...at.style } : { ...host_!.textStyle };
  };

  /** The first typed character creates the object (one undo step with its first burst of typing). */
  function createFromPending(host: ToolHost, text: string): void {
    const { session } = host;
    const sp = host.space;
    const layerId = host.activeLayerId;
    const p = pending;
    if (!session || !sp || !p || !layerId) return;
    const style: TextStyle = { ...host.textStyle, ...(host.pendingTextStyle ?? {}) };
    host.consumePendingTextStyle();
    const story: TextRun[] = [{ text, style }];
    let node: TextNode;
    if (p.source) {
      const path: TextPath = { anchors: p.source.anchors, closed: p.source.closed };
      node = createText(session.ids, p.kind === 'onPath' ? { kind: 'onPath', path, options: { effect: 'rainbow', align: 'baseline', spacing: 0, flip: false, start: Math.min(0.95, p.source.startFraction ?? 0), end: 1 } } : { kind: 'area', frame: path }, story);
      node.transform = [...p.source.transform] as Matrix;
    } else if (p.kind === 'area' && p.frameSize) {
      const w = p.frameSize.w;
      const h = p.frameSize.h;
      const frame: TextPath = { anchors: [0, 1, 2, 3].map((i) => ({ p: { x: i === 1 || i === 2 ? w : 0, y: i >= 2 ? h : 0 }, in: null, out: null, kind: 'corner' as const })), closed: true };
      node = createText(session.ids, { kind: 'area', frame }, story);
      node.transform = translation(p.at.x, p.at.y);
    } else {
      node = createText(session.ids, { kind: 'point' }, story);
      node.transform = translation(p.at.x, p.at.y);
    }
    if (host.paragraphStyle && Object.keys(host.paragraphStyle).length > 0) node.paragraphs = [{ ...host.paragraphStyle }];
    const command = p.source ? replaceNode(sp.id, p.source.id, [node]) : addNode(sp.id, layerId, node);
    // The creation shares its merge key with the typing that follows, so the first burst is one undo step.
    const burst = host.gestureKey();
    session.run({ ...command, mergeKey: `text.edit:${node.id}:${burst}` }, selectOnly(sp.id, [node.id]));
    editing = { id: node.id, anchor: text.length, caret: text.length, burst, column: null };
    pending = null;
    startBlink(host);
    placeInput(host);
    report(host);
  }

  function replaceSelection(host: ToolHost, text: string, styleOverride?: TextStyle): void {
    const n = clamp(host);
    const { session } = host;
    const sp = host.space;
    if (!n || !editing || !session || !sp) return;
    const from = Math.min(editing.anchor, editing.caret);
    const to = Math.max(editing.anchor, editing.caret);
    if (from === to && text === '') return;
    const pendingStyle = host.pendingTextStyle;
    const typing = styleOverride ?? (pendingStyle ? { ...styleAtIndex(n.node, from), ...pendingStyle } : undefined);
    if (pendingStyle) host.consumePendingTextStyle();
    const story = replaceRange(n.node.story, from, to, text, typing);
    session.run(setTextContent(sp.id, editing.id, story, { from, to, inserted: text }, editing.burst));
    editing.caret = from + text.length;
    editing.anchor = editing.caret;
    editing.column = null;
    blinkOn = true;
    placeInput(host);
    report(host);
  }

  function moveTo(host: ToolHost, caret: number, extend: boolean): void {
    if (!editing) return;
    editing.caret = caret;
    if (!extend) editing.anchor = caret;
    editing.burst = host.gestureKey();
    blinkOn = true;
    placeInput(host);
    report(host);
  }

  function styleSelection(host: ToolHost, patch: Partial<TextStyle>): void {
    const n = clamp(host);
    const { session } = host;
    const sp = host.space;
    if (!n || !editing || !session || !sp) return;
    const from = Math.min(editing.anchor, editing.caret);
    const to = Math.max(editing.anchor, editing.caret);
    const ranges = from === to ? undefined : new Map([[editing.id, [from, to] as const]]);
    session.run(styleText(sp.id, [editing.id], patch, ranges));
    report(host);
  }

  /** Text object under a document point (the topmost one). */
  function textAt(host: ToolHost, doc: Vec2): { node: TextNode; world: Matrix } | null {
    for (const hit of host.hitTest(doc)) if (hit.node.type === 'text') return { node: hit.node, world: hit.world };
    return null;
  }

  function indexIn(host: ToolHost, n: { node: TextNode; world: Matrix }, doc: Vec2): number {
    const inv = invert(n.world);
    const layout = textGeometry(n.node).layout;
    if (!inv || !layout) return 0;
    return indexAt(layout, rotate(inv, doc));
  }

  return {
    id,
    cursor: () => 'text',
    onActivate(host) {
      // Double click on text with the Selection tool: edit it, the caret where the click was.
      const request = host.takeTextEditRequest();
      const target = request ? nodeOf(host, request.id) : null;
      if (!request || !target) return;
      const index = indexIn(host, target, request.at);
      begin(host, request.id, index);
    },
    get editingText() {
      return editing !== null || pending !== null;
    },

    onPointerDown(event: CanvasPointerEvent, host) {
      const { session } = host;
      const sp = space(host);
      if (event.button !== 0 || !session || !sp) return;
      pointer = event.doc;

      // A click inside the text being edited moves the caret (Shift extends, double click = word, triple = paragraph).
      const current = editing ? nodeOf(host, editing.id) : null;
      const target = textAt(host, event.doc);
      if (editing && current && target && target.node.id === editing.id) {
        const index = indexIn(host, current, event.doc);
        const text = plainText(current.node.story);
        if (event.clickCount >= 3) {
          const [a, b] = paragraphRangeAt(text, index);
          editing.anchor = a;
          editing.caret = b;
        } else if (event.clickCount === 2) {
          const [a, b] = wordAt(text, index);
          editing.anchor = a;
          editing.caret = b;
        } else {
          if (!event.shiftKey) editing.anchor = index;
          editing.caret = index;
        }
        editing.burst = host.gestureKey();
        state = { kind: 'select', id: editing.id, fromIndex: editing.anchor };
        placeInput(host);
        report(host);
        return;
      }

      // Anything else ends the current edit.
      if (editing || pending) finish(host);

      // An existing text object: edit it (Type on a Path / Area Type also take a click on text to edit it).
      if (target) {
        const index = indexIn(host, target, event.doc);
        const text = plainText(target.node.story);
        const [a, b] = event.clickCount >= 2 ? wordAt(text, index) : [index, index];
        begin(host, target.node.id, b, a);
        state = { kind: 'select', id: target.node.id, fromIndex: a };
        return;
      }

      // A path: Area Type / T on a closed path flows text inside it; Type on a Path / T on an open path puts text on it.
      const hit = host.hitTest(event.doc).find((h) => h.node.type === 'path' || h.node.type === 'shape');
      if (hit && (mode !== 'point' || true)) {
        const frame = pathFrameOf(sp, hit.node.id);
        if (frame && (frame.owner.type === 'path' || frame.live)) {
          const closed = frame.path.closed;
          const wantArea = mode === 'area' || (mode === 'point' && closed && hit.part === 'fill');
          const wantPath = mode === 'onPath' || (mode === 'point' && !closed);
          if (wantArea && closed) {
            pending = { kind: 'area', at: event.doc, source: { id: frame.owner.id, transform: [...frame.owner.transform] as Matrix, anchors: frame.path.anchors, closed: true } };
          } else if (wantPath || (mode === 'point' && hit.part === 'stroke')) {
            const local = worldToLocal(frame.world, event.doc);
            const projection = projectOnSubPath({ anchors: frame.path.anchors, closed: frame.path.closed }, local);
            const fraction = projection ? fractionAlong(frame.path.anchors, frame.path.closed, projection.segmentIndex, projection.t) : 0;
            pending = { kind: 'onPath', at: event.doc, source: { id: frame.owner.id, transform: [...frame.owner.transform] as Matrix, anchors: frame.path.anchors, closed: frame.path.closed, startFraction: fraction } };
          }
          if (pending) {
            startBlink(host);
            host.setTextInput({ active: true });
            placeInput(host);
            host.invalidateOverlay();
            return;
          }
        }
      }

      // Empty space: point text on a click, area text on a drag.
      const at = snapTo(host, event.doc);
      state = { kind: 'create', screen: event.screen, doc: at, pending: { kind: mode === 'area' ? 'area' : 'point', at } };
    },

    onPointerMove(event, host) {
      pointer = event.doc;
      if (state.kind === 'create' && dragged(event.screen, state.screen)) {
        const a = state.doc;
        const x0 = Math.min(a.x, event.doc.x);
        const y0 = Math.min(a.y, event.doc.y);
        state.pending = { kind: 'area', at: { x: x0, y: y0 }, frameSize: { w: Math.max(MIN_FRAME, Math.abs(event.doc.x - a.x)), h: Math.max(MIN_FRAME, Math.abs(event.doc.y - a.y)) } };
        host.invalidateOverlay();
        return;
      }
      if (state.kind === 'select' && editing) {
        const n = nodeOf(host, editing.id);
        if (n) {
          editing.caret = indexIn(host, n, event.doc);
          placeInput(host);
          report(host);
        }
        return;
      }
      host.setHover(host.hitAt(event.doc));
    },

    onPointerUp(_event, host) {
      const s = state;
      if (s.kind === 'create') {
        state = { kind: 'idle' };
        pending = s.pending;
        startBlink(host);
        host.setTextInput({ active: true });
        placeInput(host);
        host.invalidateOverlay();
        return;
      }
      if (s.kind === 'select') state = { kind: 'idle' };
      // The browser moves focus to the clicked canvas after the press: take it back for the hidden input.
      if (editing || pending) {
        host.setTextInput({ active: true });
        placeInput(host);
      }
    },

    onTextInput(text, host) {
      if (pending) {
        createFromPending(host, text.replace(/\r/g, ''));
        return;
      }
      if (!editing) return;
      replaceSelection(host, text.replace(/\r\n?/g, '\n'));
    },

    onTextKey(event: ToolKeyEvent, host) {
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key;
      const session = host.session;
      if (key === 'Escape') {
        const wasEditing = editing !== null || pending !== null;
        finish(host);
        if (wasEditing) host.switchTool('tool-select');
        return true;
      }
      if (ctrl && key.toLowerCase() === 'z') {
        if (event.shiftKey) session?.redo();
        else session?.undo();
        clamp(host);
        report(host);
        return true;
      }
      if (ctrl && key.toLowerCase() === 'y') {
        session?.redo();
        return true;
      }
      if (!editing) return pending !== null && (key === 'Backspace' || key === 'Delete');
      const n = clamp(host);
      if (!n) return false;
      const text = plainText(n.node.story);
      const layout = textGeometry(n.node).layout;
      const sel = [Math.min(editing.anchor, editing.caret), Math.max(editing.anchor, editing.caret)] as const;

      if (ctrl && key.toLowerCase() === 'a') {
        editing.anchor = 0;
        editing.caret = text.length;
        placeInput(host);
        report(host);
        return true;
      }
      // Typography shortcuts (specs/07): Alt+←/→ tracking, Alt+↑/↓ leading, Ctrl+Shift+< / > size.
      if (event.altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
        const current = commonStyle(n.node.story, sel[0], sel[1], 'tracking');
        const base = current.mixed ? 0 : (current.value ?? 0);
        styleSelection(host, { tracking: base + (key === 'ArrowRight' ? 20 : -20) });
        return true;
      }
      if (event.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
        const size = commonStyle(n.node.story, sel[0], sel[1], 'size');
        const leading = commonStyle(n.node.story, sel[0], sel[1], 'leading');
        const base = !leading.mixed && leading.value !== undefined ? leading.value : (size.mixed ? 12 : size.value) * 1.2;
        styleSelection(host, { leading: Math.max(1, base + (key === 'ArrowUp' ? 2 : -2) * -1) });
        return true;
      }
      if (ctrl && event.shiftKey && (key === '<' || key === '>' || key === ',' || key === '.')) {
        const size = commonStyle(n.node.story, sel[0], sel[1], 'size');
        const base = size.mixed ? 12 : size.value;
        styleSelection(host, { size: Math.max(1, base + (key === '>' || key === '.' ? 2 : -2)) });
        return true;
      }

      switch (key) {
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown':
        case 'Home':
        case 'End': {
          // With a selection, Left/Right collapse to its edge first.
          if (!event.shiftKey && sel[0] !== sel[1] && (key === 'ArrowLeft' || key === 'ArrowRight') && !ctrl) {
            moveTo(host, key === 'ArrowLeft' ? sel[0] : sel[1], false);
            return true;
          }
          const moved = moveCaret(layout, text, editing.caret, key, ctrl, editing.column);
          moveTo(host, moved.caret, event.shiftKey);
          if (editing) editing.column = moved.column;
          return true;
        }
        case 'Backspace': {
          if (sel[0] !== sel[1]) replaceSelection(host, '');
          else if (sel[0] > 0) {
            const from = ctrl ? moveCaret(layout, text, sel[0], 'ArrowLeft', true, null).caret : sel[0] - 1;
            editing.anchor = from;
            editing.caret = sel[0];
            replaceSelection(host, '');
          }
          return true;
        }
        case 'Delete': {
          if (sel[0] !== sel[1]) replaceSelection(host, '');
          else if (sel[0] < text.length) {
            const to = ctrl ? moveCaret(layout, text, sel[0], 'ArrowRight', true, null).caret : sel[0] + 1;
            editing.anchor = sel[0];
            editing.caret = to;
            replaceSelection(host, '');
          }
          return true;
        }
        case 'Enter': {
          if (n.node.kind !== 'onPath') replaceSelection(host, '\n');
          return true;
        }
        default:
          return false;
      }
    },

    onTextClipboard(kind, text, host) {
      const n = clamp(host);
      if (!n || !editing) return null;
      const from = Math.min(editing.anchor, editing.caret);
      const to = Math.max(editing.anchor, editing.caret);
      if (kind === 'paste') {
        const incoming = (text ?? '').replace(/\r\n?/g, '\n');
        if (incoming === '') return null;
        if (clipboard && clipboard.text === incoming) {
          // Same text copied inside the app: keep its styles.
          const { session } = host;
          const sp = host.space;
          if (!session || !sp) return null;
          let story = replaceRange(n.node.story, from, to, '');
          let at = from;
          for (const run of clipboard.runs) {
            story = insertText(story, at, run.text, run.style);
            at += run.text.length;
          }
          session.run(setTextContent(sp.id, editing.id, story, { from, to, inserted: incoming }, editing.burst));
          editing.caret = editing.anchor = from + incoming.length;
          placeInput(host);
          report(host);
          return null;
        }
        replaceSelection(host, incoming);
        return null;
      }
      if (from === to) return null;
      const copied = plainText(sliceStory(n.node.story, from, to));
      clipboard = { text: copied, runs: sliceStory(n.node.story, from, to) };
      if (kind === 'cut') replaceSelection(host, '');
      return copied;
    },

    onKey(key, host) {
      if (key === 'Escape' && (editing || pending)) {
        finish(host);
        host.switchTool('tool-select');
      }
    },

    onLeave(host) {
      host.setHover(null);
    },

    cancel(host) {
      finish(host);
    },

    drawOverlay(ctx, host, theme) {
      const view = host.view;
      const toScreen = (p: Vec2) => ({ x: p.x * view.zoom + view.panX, y: p.y * view.zoom + view.panY });
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = theme.accent;
      ctx.fillStyle = theme.accentSoft;

      // The rectangle being dragged for an area text.
      const live = state.kind === 'create' ? state.pending : pending;
      if (live?.frameSize) {
        const a = toScreen(live.at);
        ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, live.frameSize.w * view.zoom, live.frameSize.h * view.zoom);
      }
      // The caret of a text that does not exist yet.
      if (pending && !editing && blinkOn) {
        const a = toScreen(pending.at);
        const h = host.textStyle.size * view.zoom;
        ctx.strokeStyle = '#000000';
        ctx.beginPath();
        ctx.moveTo(Math.round(a.x) + 0.5, a.y - h * 0.8);
        ctx.lineTo(Math.round(a.x) + 0.5, a.y + h * 0.2);
        ctx.stroke();
      }
      if (editing) {
        const n = nodeOf(host, editing.id);
        const layout = n ? textGeometry(n.node).layout : null;
        if (n && layout) {
          const len = plainText(n.node.story).length;
          const from = Math.min(editing.anchor, editing.caret, len);
          const to = Math.min(Math.max(editing.anchor, editing.caret), len);
          // Selection highlight: one rectangle per line.
          if (from !== to) {
            ctx.fillStyle = theme.accentSoft;
            for (const line of layout.lines) {
              const gs = layout.glyphs.filter((g) => g.line === line.index && g.index >= from && g.index < to);
              if (gs.length === 0) continue;
              const first = gs[0]!;
              const last = gs[gs.length - 1]!;
              const quad = [
                { x: first.x, y: line.y - line.ascent },
                { x: last.x + last.advance, y: line.y - line.ascent },
                { x: last.x + last.advance, y: line.y + line.descent },
                { x: first.x, y: line.y + line.descent },
              ].map((p) => toScreen(rotate(n.world, p)));
              ctx.beginPath();
              quad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
              ctx.closePath();
              ctx.fill();
            }
          }
          if (blinkOn && from === to) {
            const c = caretAt(layout, editing.caret);
            const a = toScreen(rotate(n.world, { x: c.x, y: c.y }));
            const b = toScreen(rotate(n.world, { x: c.x, y: c.y + c.height }));
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      ctx.restore();
      void pointer;
    },
  };
}

/** Fraction (0..1) of a path's length at a span and parameter, by sampling span lengths. */
export function fractionAlong(anchors: readonly Anchor[], closed: boolean, segment: number, t: number): number {
  const sample = (a: Anchor, b: Anchor, upTo: number): number => {
    let length = 0;
    let prev = a.p;
    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      const u = (i / steps) * upTo;
      const mt = 1 - u;
      const c1 = a.out ?? a.p;
      const c2 = b.in ?? b.p;
      const p = {
        x: mt ** 3 * a.p.x + 3 * mt * mt * u * c1.x + 3 * mt * u * u * c2.x + u ** 3 * b.p.x,
        y: mt ** 3 * a.p.y + 3 * mt * mt * u * c1.y + 3 * mt * u * u * c2.y + u ** 3 * b.p.y,
      };
      length += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
    }
    return length;
  };
  const count = closed ? anchors.length : anchors.length - 1;
  let total = 0;
  let before = 0;
  for (let i = 0; i < count; i++) {
    const a = anchors[i] as Anchor;
    const b = anchors[(i + 1) % anchors.length] as Anchor;
    const full = sample(a, b, 1);
    if (i < segment) before += full;
    if (i === segment) before += sample(a, b, t);
    total += full;
  }
  return total === 0 ? 0 : before / total;
}


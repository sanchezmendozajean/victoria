import { addNode, redrawShape, selectOnly, type Vec2 } from '../../core';
import type { ToolId } from '../app/tools';
import { formatLength } from '../canvas/units';
import { buildShape, defaultShapePrefs, isDegenerate, shapeFromDrag, type ShapePrefs, type ShapeSpec, type ShapeToolKind } from './shapeDrag';
import { dragged, snapTo, withLook } from './shared';
import type { Tool, ToolHost } from './types';

/** What the shape tools remember between drags: one set for the session (Illustrator keeps it in preferences). */
export const shapePrefs: ShapePrefs = defaultShapePrefs();

interface Press {
  screen: Vec2;
  start: Vec2;
  last: Vec2;
  key: string;
  dragging: boolean;
  id: string | null;
  lockedR2: number | null;
  modifiers: { shift: boolean; alt: boolean; ctrl: boolean };
}

const measureText = (spec: ShapeSpec, host: ToolHost): string => {
  const f = (v: number) => formatLength(v, host.units);
  switch (spec.shape) {
    case 'rect':
    case 'ellipse':
      return `${f(spec.w)} × ${f(spec.h)}`;
    case 'polygon':
      return `${f(spec.radius)} · ${spec.sides}`;
    case 'star':
      return `${f(spec.r1)} · ${spec.points}`;
    case 'line':
      return f(spec.length);
  }
};

interface PointerLike {
  doc: Vec2;
  screen: Vec2;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
}

/**
 * Rectangle, rounded rectangle, ellipse, polygon, star and line (specs/03 · Formas). The drag creates a
 * live shape as one undo step; a click without dragging asks for exact dimensions.
 */
export function createShapeTool(id: ToolId, kind: ShapeToolKind): Tool {
  let press: Press | null = null;
  let spaceDown = false;

  function end(host: ToolHost): void {
    press = null;
    spaceDown = false;
    host.setSnapLines(null);
    host.setMeasure(null);
  }

  function redraw(event: PointerLike, host: ToolHost, p: Press): void {
    const { session, space } = host;
    const layerId = host.activeLayerId;
    if (!session || !space || !layerId) return;
    p.modifiers = { shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey };
    const to = event.shiftKey ? event.doc : snapTo(host, event.doc);
    let spec = shapeFromDrag({ kind, start: p.start, end: to, shift: event.shiftKey, alt: event.altKey, prefs: shapePrefs });
    if (spec.shape === 'star' && event.ctrlKey) {
      p.lockedR2 ??= spec.r2;
      spec = { ...spec, r2: p.lockedR2 };
    } else {
      p.lockedR2 = null;
    }
    host.setMeasure(measureText(spec, host), { x: event.screen.x + 14, y: event.screen.y + 14 });
    if (isDegenerate(spec)) return;
    if (!p.id) {
      const node = withLook(buildShape(session.ids, spec), host, spec.shape === 'line');
      p.id = node.id;
      session.run(addNode(space.id, layerId, node, undefined, `draw:${p.key}`), selectOnly(space.id, [node.id]));
      return;
    }
    const existing = p.id;
    // Only the geometry follows the drag: the look chosen when the shape was created must not be reset.
    const { id: _id, appearance: _look, ...patch } = buildShape(() => existing, spec);
    void _id;
    void _look;
    session.run(redrawShape(space.id, existing, patch, p.key));
  }

  return {
    id,
    cursor: () => 'crosshair',
    wantsSpace: () => press?.dragging === true,
    gestureKeys: true,

    onPointerDown(event, host) {
      if (event.button !== 0 || !host.session) return;
      const start = snapTo(host, event.doc);
      press = { screen: event.screen, start, last: event.doc, key: host.gestureKey(), dragging: false, id: null, lockedR2: null, modifiers: { shift: false, alt: false, ctrl: false } };
    },

    onPointerMove(event, host) {
      const p = press;
      if (!p) return;
      if (!p.dragging && dragged(event.screen, p.screen)) p.dragging = true;
      if (!p.dragging) return;
      if (spaceDown) p.start = { x: p.start.x + event.doc.x - p.last.x, y: p.start.y + event.doc.y - p.last.y };
      p.last = event.doc;
      redraw(event, host, p);
    },

    onPointerUp(_event, host) {
      const p = press;
      end(host);
      if (p && !p.dragging) host.openShapeDialog(kind, p.start);
    },

    onKey(key, host) {
      if (key !== 'Escape' || !press) return;
      if (press.id) host.session?.rollback();
      end(host);
    },

    onKeyDown(event, host) {
      const p = press;
      if (!p) return false;
      if (event.key === ' ') {
        spaceDown = true;
        return true;
      }
      const step = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
      if (step === 0 || (kind !== 'polygon' && kind !== 'star')) return false;
      if (kind === 'polygon') shapePrefs.sides = Math.max(3, shapePrefs.sides + step);
      else shapePrefs.points = Math.max(3, shapePrefs.points + step);
      redraw({ doc: p.last, screen: p.screen, shiftKey: p.modifiers.shift, altKey: p.modifiers.alt, ctrlKey: p.modifiers.ctrl }, host, p);
      return true;
    },

    onKeyUp(key) {
      if (key === ' ') spaceDown = false;
    },

    cancel(host) {
      if (press?.id) host.session?.rollback();
      end(host);
    },
  };
}

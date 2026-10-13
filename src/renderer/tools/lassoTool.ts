import {
  anchorsInPolygon,
  emptySelection,
  pathFrameOf,
  rectFromPoints,
  visibleLeafIds,
  withAnchors,
  type Vec2,
} from '../../core';
import { currentSelection, dragged } from './shared';
import type { Tool } from './types';

/** Lasso (Q): draw a free loop; the anchors inside it are selected (Shift adds), like Illustrator. */
export function createLassoTool(): Tool {
  let loop: { screen: Vec2[]; doc: Vec2[]; shift: boolean } | null = null;

  return {
    id: 'tool-lasso',
    cursor: () => 'crosshair',

    onPointerDown(event, host) {
      const { session, space } = host;
      if (!session || !space) return;
      if (!event.shiftKey) session.select(emptySelection(space.id));
      loop = { screen: [event.screen], doc: [event.doc], shift: event.shiftKey };
    },

    onPointerMove(event, host) {
      if (!loop) return;
      const last = loop.screen[loop.screen.length - 1] as Vec2;
      if (!dragged(event.screen, last) && loop.screen.length > 1) return;
      loop.screen.push(event.screen);
      loop.doc.push(event.doc);
      host.invalidateOverlay();
    },

    onPointerUp(_event, host) {
      const finished = loop;
      loop = null;
      host.invalidateOverlay();
      const { session, space } = host;
      if (!finished || !session || !space || finished.doc.length < 3) return;

      const bounds = rectFromPoints(finished.doc);
      if (!bounds) return;
      const found = anchorsInPolygon(space, visibleLeafIds(space, bounds), finished.doc);
      const base = finished.shift ? (currentSelection(host) ?? emptySelection(space.id)) : emptySelection(space.id);
      const byPath: { [pathId: string]: number[] } = { ...(finished.shift ? base.anchors : {}) };
      const owners = new Set(base.ids);
      for (const a of found) {
        (byPath[a.pathId] ??= []).push(a.index);
        const owner = pathFrameOf(space, a.pathId)?.owner.id;
        if (owner) owners.add(owner);
      }
      session.select(withAnchors({ ...base, ids: [...owners] }, byPath));
    },

    onKey(key, host) {
      if (key === 'Escape' && loop) {
        loop = null;
        host.invalidateOverlay();
      }
    },

    cancel(host) {
      loop = null;
      host.invalidateOverlay();
    },

    drawOverlay(ctx, _host, theme) {
      if (!loop || loop.screen.length < 2) return;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = theme.accent;
      ctx.beginPath();
      loop.screen.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
    },
  };
}

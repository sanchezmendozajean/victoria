import { applyToPoint, cropOf, frameOf, invert, multiply, recropImage, worldRotationOf, type CropInfo, type CropRect, type Matrix, type Vec2 } from '../../core';
import { useUi } from '../app/store';
import { HANDLE_IDS, type HandleId } from './boxGeometry';
import { dragCropHandle } from './cropGeometry';
import { cursorForTurnedHandle } from './orientedBox';
import { createSelectionTool } from './selectionTool';
import { selectedTopLevel } from './shared';
import type { Tool, ToolHost } from './types';

const GRAB = 7; // screen px
const SQUARE = 6;

/** Where the handles of a crop window sit, in local units of the image. */
function handleSpots(rect: CropRect): Record<HandleId, Vec2> {
  const { x, y, w, h } = rect;
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

interface CropFrame {
  info: CropInfo;
  /** Image local → Space. */
  world: Matrix;
  theta: number;
}

/** The crop being edited: the single selected object when "Recortar imagen" is on and it is a crop group. */
function activeCrop(host: ToolHost): CropFrame | null {
  const { cropMode } = useUi.getState();
  const { space } = host;
  if (!cropMode || !space) return null;
  const ids = selectedTopLevel(host);
  if (ids.length !== 1 || ids[0] !== cropMode) return null;
  const frame = frameOf(space, cropMode);
  const info = cropOf(frame?.node);
  if (!frame || !info) return null;
  return { info, world: multiply(frame.world, info.image.transform), theta: worldRotationOf(space, info.image.id) };
}

const toScreen = (host: ToolHost, p: Vec2): Vec2 => ({ x: p.x * host.view.zoom + host.view.panX, y: p.y * host.view.zoom + host.view.panY });

function handleUnder(host: ToolHost, crop: CropFrame, screen: Vec2): HandleId | null {
  const spots = handleSpots(crop.info.rect);
  for (const id of HANDLE_IDS) {
    const p = toScreen(host, applyToPoint(crop.world, spots[id]));
    if (Math.abs(p.x - screen.x) <= GRAB && Math.abs(p.y - screen.y) <= GRAB) return id;
  }
  return null;
}

/**
 * The Selection tool plus "Recortar imagen": while the mode is on for the selected crop, its window shows handles on the
 * canvas that pull its edges (one undo step per drag); everything else behaves as the Selection tool. Enter or Escape end it.
 */
export function createCropAwareSelection(): Tool {
  const inner = createSelectionTool();
  let drag: { handle: HandleId; start: CropRect; key: string } | null = null;
  let hoverCursor: string | null = null;

  const end = (host: ToolHost) => {
    useUi.getState().setCropMode(null);
    drag = null;
    hoverCursor = null;
    host.invalidateOverlay();
  };

  return {
    ...inner,
    cursor: (altKey) => hoverCursor ?? inner.cursor(altKey),

    onPointerDown(event, host) {
      const crop = activeCrop(host);
      const handle = crop && event.button === 0 ? handleUnder(host, crop, event.screen) : null;
      if (crop && handle) {
        drag = { handle, start: crop.info.rect, key: host.gestureKey() };
        return;
      }
      inner.onPointerDown(event, host);
    },

    onPointerMove(event, host) {
      const crop = activeCrop(host);
      if (drag && crop && host.session && host.space) {
        const inverse = invert(crop.world);
        if (!inverse) return;
        const rect = dragCropHandle(drag.handle, drag.start, applyToPoint(inverse, event.doc));
        host.session.run(recropImage(host.space.id, crop.info, rect, drag.key));
        host.invalidateOverlay();
        return;
      }
      const over = crop ? handleUnder(host, crop, event.screen) : null;
      hoverCursor = over && crop ? cursorForTurnedHandle(over, crop.theta) : null;
      if (over) {
        host.setHover(null);
        return;
      }
      inner.onPointerMove(event, host);
    },

    onPointerUp(event, host) {
      if (drag) {
        drag = null;
        host.invalidateOverlay();
        return;
      }
      inner.onPointerUp(event, host);
    },

    onKey(key, host) {
      if ((key === 'Escape' || key === 'Enter') && activeCrop(host)) {
        if (key === 'Escape' && drag) host.session?.rollback();
        end(host);
        return;
      }
      inner.onKey?.(key, host);
    },

    cancel(host) {
      if (drag) host.session?.rollback();
      drag = null;
      hoverCursor = null;
      inner.cancel?.(host);
    },

    drawOverlay(ctx, host, theme) {
      const crop = activeCrop(host);
      if (!crop) {
        // Selection changed: the mode is over.
        if (useUi.getState().cropMode) useUi.getState().setCropMode(null);
        inner.drawOverlay?.(ctx, host, theme);
        return;
      }
      const { x, y, w, h } = crop.info.rect;
      const corners = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map((p) => toScreen(host, applyToPoint(crop.world, p)));
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = theme.accent;
      ctx.beginPath();
      corners.forEach((p, i) => (i === 0 ? ctx.moveTo(Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5) : ctx.lineTo(Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5)));
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (const id of HANDLE_IDS) {
        const p = toScreen(host, applyToPoint(crop.world, handleSpots(crop.info.rect)[id]));
        ctx.fillRect(Math.floor(p.x) - SQUARE / 2 + 0.5, Math.floor(p.y) - SQUARE / 2 + 0.5, SQUARE, SQUARE);
        ctx.strokeRect(Math.floor(p.x) - SQUARE / 2 + 0.5, Math.floor(p.y) - SQUARE / 2 + 0.5, SQUARE, SQUARE);
      }
      ctx.restore();
    },
  };
}

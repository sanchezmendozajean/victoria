import type { Units, Viewport } from '../../core';
import { PT_PER_UNIT, rulerScale } from './units';
import type { CanvasTheme } from './theme';

export const RULER_SIZE = 18;

const FONT = '9px "Inter Variable", Inter, system-ui, sans-serif';

function labelText(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded).replace('.', ',');
}

/**
 * Draws one ruler. `length` is the canvas size along the ruler in CSS px (it starts at the canvas
 * edge, which is also the edge of the drawing surface, so view coordinates apply directly).
 * `originPt` is where 0 sits on this axis, in Space points (the active artboard's corner).
 */
export function renderRuler(
  ctx: CanvasRenderingContext2D,
  orientation: 'horizontal' | 'vertical',
  length: number,
  dpr: number,
  view: Viewport,
  originPt: number,
  units: Units,
  theme: CanvasTheme,
): void {
  const horizontal = orientation === 'horizontal';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme.rulerBg;
  ctx.fillRect(0, 0, horizontal ? length : RULER_SIZE, horizontal ? RULER_SIZE : length);

  const pan = horizontal ? view.panX : view.panY;
  const { every, divisions } = rulerScale(view.zoom, units);
  const minorPt = (every * PT_PER_UNIT[units]) / divisions;
  const minorPx = minorPt * view.zoom;
  const first = Math.floor((-pan / view.zoom - originPt) / minorPt) - 1;
  const last = Math.ceil(((length - pan) / view.zoom - originPt) / minorPt) + 1;

  ctx.strokeStyle = theme.rulerText;
  ctx.fillStyle = theme.rulerText;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1;
  ctx.font = FONT;
  ctx.beginPath();
  const labels: Array<[number, string]> = [];
  for (let k = first; k <= last; k++) {
    const mod = ((k % divisions) + divisions) % divisions;
    const major = mod === 0;
    if (!major && minorPx < 4) continue;
    const size = major ? RULER_SIZE : divisions % 2 === 0 && mod === divisions / 2 ? 8 : 4;
    const at = Math.round((originPt + k * minorPt) * view.zoom + pan) + 0.5;
    if (at < 0 || at > length) continue;
    if (horizontal) {
      ctx.moveTo(at, RULER_SIZE);
      ctx.lineTo(at, RULER_SIZE - size);
    } else {
      ctx.moveTo(RULER_SIZE, at);
      ctx.lineTo(RULER_SIZE - size, at);
    }
    if (major) labels.push([at, labelText((k / divisions) * every)]);
  }
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.textBaseline = 'top';
  for (const [at, text] of labels) {
    if (horizontal) {
      ctx.fillText(text, at + 3, 1);
    } else {
      ctx.save();
      ctx.translate(2, at - 3);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }

  ctx.strokeStyle = theme.rulerBorder;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(0, RULER_SIZE - 0.5);
    ctx.lineTo(length, RULER_SIZE - 0.5);
  } else {
    ctx.moveTo(RULER_SIZE - 0.5, 0);
    ctx.lineTo(RULER_SIZE - 0.5, length);
  }
  ctx.stroke();
}

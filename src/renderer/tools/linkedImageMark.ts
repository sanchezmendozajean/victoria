import { applyToPoint, type Vec2 } from '../../core';
import { imageFactsOf } from '../app/imageObjectActions';
import type { ToolHost } from './types';

/**
 * A selected image that is linked (not embedded) shows the two diagonals of its frame, as Illustrator does:
 * it tells at a glance that the picture lives in a file and not inside the document.
 */
export function drawLinkedImageMarks(ctx: CanvasRenderingContext2D, host: ToolHost, ids: readonly string[], color: string): void {
  const { space, session } = host;
  if (!space || !session) return;
  const { zoom, panX, panY } = host.view;
  for (const id of ids) {
    const facts = imageFactsOf(session, space, id);
    if (!facts || facts.link === 'embedded') continue;
    const { width, height } = facts.image;
    const corner = (x: number, y: number): Vec2 => {
      const p = applyToPoint(facts.world, { x, y });
      return { x: Math.floor(p.x * zoom + panX) + 0.5, y: Math.floor(p.y * zoom + panY) + 0.5 };
    };
    const a = corner(0, 0);
    const b = corner(width, 0);
    const c = corner(width, height);
    const d = corner(0, height);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c.x, c.y);
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
    ctx.restore();
  }
}

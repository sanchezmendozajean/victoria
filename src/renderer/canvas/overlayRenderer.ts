import type { Guide, Matrix, Node, Viewport } from '../../core';
import { pathFor } from './contentRenderer';
import type { CanvasTheme } from './theme';

export interface HoverTarget {
  node: Node;
  /** Local → Space matrix of the node. */
  world: Matrix;
  /** Outline colour: the colour of the node's layer (specs/03 · Selección › Hover). */
  color: string;
}

export interface OverlayOptions {
  view: Viewport;
  width: number;
  height: number;
  dpr: number;
  theme: CanvasTheme;
  guides: readonly Guide[];
  showGuides: boolean;
  hoveredGuideId: string | null;
  hover: HoverTarget | null;
  /** Guide being created or moved: drawn even while it is only a preview. */
  draggingGuide: { orientation: Guide['orientation']; position: number } | null;
  /** Extra drawing by the active tool (marquees, rubber bands…), in screen pixels. */
  drawTool: ((ctx: CanvasRenderingContext2D) => void) | null;
}

function drawGuideLine(ctx: CanvasRenderingContext2D, o: OverlayOptions, orientation: Guide['orientation'], position: number): void {
  ctx.beginPath();
  if (orientation === 'vertical') {
    const x = Math.round(position * o.view.zoom + o.view.panX) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, o.height);
  } else {
    const y = Math.round(position * o.view.zoom + o.view.panY) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(o.width, y);
  }
  ctx.stroke();
}

/** The overlay sits above the artwork and is cheap to repaint: guides, hover outline and tool previews. */
export function renderOverlay(ctx: CanvasRenderingContext2D, o: OverlayOptions): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);

  if (o.showGuides) {
    ctx.lineWidth = 1;
    for (const guide of o.guides) {
      ctx.strokeStyle = guide.id === o.hoveredGuideId ? o.theme.accent : o.theme.guide;
      drawGuideLine(ctx, o, guide.orientation, guide.position);
    }
  }
  if (o.draggingGuide) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = o.theme.guide;
    drawGuideLine(ctx, o, o.draggingGuide.orientation, o.draggingGuide.position);
  }

  if (o.hover) {
    const path = pathFor(o.hover.node);
    if (path) {
      ctx.save();
      ctx.transform(o.view.zoom, 0, 0, o.view.zoom, o.view.panX, o.view.panY);
      ctx.transform(...o.hover.world);
      const t = ctx.getTransform();
      const scale = Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) || 1;
      ctx.lineWidth = o.dpr / scale;
      ctx.strokeStyle = o.hover.color;
      ctx.stroke(path);
      ctx.restore();
    }
  }

  o.drawTool?.(ctx);
}

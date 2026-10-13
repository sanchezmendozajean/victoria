import type { Guide, Matrix, Node, SnapLine, Vec2, Viewport } from '../../core';
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
  /** Selected objects: outlined in their layer colour. */
  selection: HoverTarget[];
  /** Smart guides to draw, with their translated labels. */
  snapLines: SnapLine[] | null;
  snapLabels: { align: string; center: string; anchor: string };
  /** Blue measurement label next to the cursor. */
  measure: { text: string; at: Vec2 } | null;
  /** Extra drawing by the active tool (marquees, rubber bands…), in screen pixels. */
  drawTool: ((ctx: CanvasRenderingContext2D) => void) | null;
}

function outline(ctx: CanvasRenderingContext2D, o: OverlayOptions, target: HoverTarget): void {
  const path = pathFor(target.node);
  if (!path) return;
  ctx.save();
  ctx.transform(o.view.zoom, 0, 0, o.view.zoom, o.view.panX, o.view.panY);
  ctx.transform(...target.world);
  const t = ctx.getTransform();
  const scale = Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) || 1;
  ctx.lineWidth = o.dpr / scale;
  ctx.strokeStyle = target.color;
  ctx.stroke(path);
  ctx.restore();
}

function drawSnapLines(ctx: CanvasRenderingContext2D, o: OverlayOptions, lines: SnapLine[]): void {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = o.theme.smartGuide;
  ctx.fillStyle = o.theme.smartGuide;
  ctx.font = '10px "Inter Variable", Inter, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (const line of lines) {
    const vertical = line.axis === 'x';
    const at = Math.round(vertical ? line.value * o.view.zoom + o.view.panX : line.value * o.view.zoom + o.view.panY) + 0.5;
    const from = line.from === null ? 0 : (vertical ? line.from * o.view.zoom + o.view.panY : line.from * o.view.zoom + o.view.panX);
    const to = line.to === null ? (vertical ? o.height : o.width) : (vertical ? line.to * o.view.zoom + o.view.panY : line.to * o.view.zoom + o.view.panX);
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(at, from);
      ctx.lineTo(at, to);
    } else {
      ctx.moveTo(from, at);
      ctx.lineTo(to, at);
    }
    ctx.stroke();
    const text = line.label ? o.snapLabels[line.label] : null;
    if (text) {
      const w = ctx.measureText(text).width + 10;
      const x = vertical ? at + 6 : Math.min(to, from) + 6;
      const y = vertical ? Math.min(to, from) + 14 : at - 12;
      ctx.fillRect(x, y - 8, w, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x + 5, y);
      ctx.fillStyle = o.theme.smartGuide;
    }
  }
  ctx.restore();
}

function drawMeasure(ctx: CanvasRenderingContext2D, o: OverlayOptions, m: { text: string; at: Vec2 }): void {
  ctx.save();
  ctx.font = '11px "Inter Variable", Inter, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(m.text).width + 14;
  const x = Math.min(m.at.x + 14, o.width - w - 4);
  const y = Math.min(m.at.y + 18, o.height - 24);
  ctx.fillStyle = o.theme.accent;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 20, 3);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(m.text, x + 7, y + 10);
  ctx.restore();
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

  for (const target of o.selection) outline(ctx, o, target);
  if (o.hover) outline(ctx, o, o.hover);

  o.drawTool?.(ctx);
  if (o.snapLines) drawSnapLines(ctx, o, o.snapLines);
  if (o.measure) drawMeasure(ctx, o, o.measure);
}

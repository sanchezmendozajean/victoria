import {
  boundsInParent,
  frameOf,
  colorToCss,
  intersects,
  invert,
  isLayer,
  nodeGeometry,
  segmentsOf,
  transformRect,
  visibleRect,
  type Appearance,
  type Artboard,
  type BlendMode,
  type Layer,
  type LayerChild,
  type Node,
  type Paint,
  type Rect,
  type Resources,
  type Space,
  type StrokeStyle,
  type Viewport,
} from '../../core';
import type { CanvasTheme } from './theme';

export interface RenderOptions {
  space: Space;
  resources: Resources;
  view: Viewport;
  /** CSS pixels. */
  width: number;
  height: number;
  dpr: number;
  /** Ctrl+Y: only 1 px outlines in the layer colour. */
  outline: boolean;
  showArtboards: boolean;
  showGrid: boolean;
  activeArtboardId: string | null;
  theme: CanvasTheme;
  /** Group being edited in isolation: everything else is dimmed. */
  isolatedId: string | null;
}

const BLEND: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
};

// ── Path2D cache: nodes are immutable, so identity is a valid key ──

const paths = new WeakMap<Node, Path2D | null>();

function buildPath(node: Node): Path2D | null {
  const geometry = nodeGeometry(node);
  if (!geometry) return null;
  const path = new Path2D();
  for (const sub of geometry.subpaths) {
    const first = sub.anchors[0];
    if (!first) continue;
    path.moveTo(first.p.x, first.p.y);
    for (const seg of segmentsOf(sub)) {
      if (seg.c1 === seg.p0 && seg.c2 === seg.p3) path.lineTo(seg.p3.x, seg.p3.y);
      else path.bezierCurveTo(seg.c1.x, seg.c1.y, seg.c2.x, seg.c2.y, seg.p3.x, seg.p3.y);
    }
    if (sub.closed) path.closePath();
  }
  return path;
}

export function pathFor(node: Node): Path2D | null {
  if (paths.has(node)) return paths.get(node) ?? null;
  const path = buildPath(node);
  paths.set(node, path);
  return path;
}

// ── Paint ──

function gradientFor(ctx: CanvasRenderingContext2D, paint: Extract<Paint, { type: 'linear' | 'radial' }>, resources: Resources): CanvasGradient | null {
  const resource = resources.gradients.find((g) => g.id === paint.gradientId);
  if (!resource || resource.stops.length === 0) return null;
  // Gradient space: the unit axis (0,0)→(1,0) (radial: unit circle at the origin) mapped into local space by `paint.transform`.
  const m = paint.transform;
  const at = (x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
  const a = at(0, 0);
  const b = at(1, 0);
  const gradient =
    paint.type === 'linear'
      ? ctx.createLinearGradient(a.x, a.y, b.x, b.y)
      : ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.hypot(b.x - a.x, b.y - a.y));
  for (const stop of resource.stops) {
    gradient.addColorStop(Math.min(1, Math.max(0, stop.offset)), colorToCss(stop.color, stop.opacity));
  }
  return gradient;
}

function paintStyle(ctx: CanvasRenderingContext2D, paint: Paint, resources: Resources): string | CanvasGradient | null {
  switch (paint.type) {
    case 'none':
      return null;
    case 'solid':
      return colorToCss(paint.color);
    case 'swatch': {
      const swatch = resources.swatches.find((s) => s.id === paint.swatchId);
      return swatch ? colorToCss(swatch.color) : null;
    }
    default:
      return gradientFor(ctx, paint, resources);
  }
}

const HUGE = 1e7;

function strokeShape(ctx: CanvasRenderingContext2D, path: Path2D, stroke: StrokeStyle, rule: CanvasFillRule): void {
  ctx.lineCap = stroke.cap;
  ctx.lineJoin = stroke.join;
  ctx.miterLimit = stroke.miterLimit;
  ctx.setLineDash(stroke.dash ?? []);
  if (stroke.align === 'center') {
    ctx.lineWidth = stroke.width;
    ctx.stroke(path);
    return;
  }
  // Inside / outside: stroke twice as wide and keep only one side with a clip.
  ctx.save();
  if (stroke.align === 'inside') {
    ctx.clip(path, rule);
  } else {
    const outside = new Path2D();
    outside.rect(-HUGE, -HUGE, 2 * HUGE, 2 * HUGE);
    outside.addPath(path);
    ctx.clip(outside, 'evenodd');
  }
  ctx.lineWidth = stroke.width * 2;
  ctx.stroke(path);
  ctx.restore();
}

const DIMMED = 0.3;

interface Env {
  /** Ids of the isolated group and its ancestors (drawn at full strength, their other children dimmed). */
  isolation: { id: string; chain: Set<string> } | null;
  ctx: CanvasRenderingContext2D;
  resources: Resources;
  outline: boolean;
  dpr: number;
}

function paintGeometry(env: Env, node: Node, layer: Layer, alpha: number): void {
  const path = pathFor(node);
  const geometry = nodeGeometry(node);
  if (!path || !geometry) return;
  const { ctx } = env;
  if (env.outline) {
    const t = ctx.getTransform();
    const scale = Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) || 1;
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.lineWidth = env.dpr / scale;
    ctx.strokeStyle = layer.color;
    ctx.stroke(path);
    return;
  }
  paintAppearance(env, path, geometry.fillRule, node.appearance, alpha);
}

function paintAppearance(env: Env, path: Path2D, rule: CanvasFillRule, appearance: Appearance, alpha: number): void {
  const { ctx, resources } = env;
  for (const item of appearance.items) {
    if (item.kind === 'modifier' || item.opacity <= 0) continue; // modifiers arrive with Phase 9
    const style = paintStyle(ctx, item.paint, resources);
    if (style === null) continue;
    ctx.globalAlpha = alpha * item.opacity;
    if (item.kind === 'fill') {
      ctx.fillStyle = style;
      ctx.fill(path, rule);
    } else {
      ctx.strokeStyle = style;
      strokeShape(ctx, path, item.stroke, rule);
    }
  }
}

function drawPlaceholderImage(env: Env, width: number, height: number): void {
  const { ctx } = env;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#d9dbde';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#8a8f96';
  ctx.lineWidth = Math.max(width, height) / 200;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width, height);
  ctx.moveTo(width, 0);
  ctx.lineTo(0, height);
  ctx.stroke();
}

function drawNode(env: Env, node: Node, cull: Rect, layer: Layer, alpha: number, inIsolation: boolean): void {
  const { ctx } = env;
  ctx.save();
  ctx.transform(...node.transform);
  const inverse = invert(node.transform);
  const localCull = inverse ? transformRect(inverse, cull) : cull;
  // Group opacity is applied per child (an approximation: overlapping children do not composite as a unit).
  const a = alpha * node.opacity;
  if (node.blendMode !== 'normal') ctx.globalCompositeOperation = BLEND[node.blendMode];

  switch (node.type) {
    case 'group':
      drawChildren(env, node.children, localCull, layer, a, inIsolation);
      break;
    case 'clipGroup': {
      const [mask, ...rest] = node.children;
      const maskPath = mask ? pathFor(mask) : null;
      if (mask && maskPath) {
        const saved = ctx.getTransform();
        ctx.transform(...mask.transform);
        ctx.clip(maskPath, nodeGeometry(mask)?.fillRule ?? 'nonzero');
        ctx.setTransform(saved);
        drawChildren(env, rest, localCull, layer, a, inIsolation);
      }
      break;
    }
    case 'image':
      drawPlaceholderImage(env, node.width, node.height);
      break;
    case 'text':
      break; // text layout and drawing arrive in Phase 7
    default:
      paintGeometry(env, node, layer, a);
  }
  ctx.restore();
}

function drawChildren(env: Env, children: readonly LayerChild[], cull: Rect, layer: Layer, alpha: number, inIsolation: boolean): void {
  for (const child of children) {
    if (isLayer(child)) {
      if (child.visible) drawChildren(env, child.children, cull, child, alpha, inIsolation);
      continue;
    }
    if (!child.visible) continue;
    const bounds = boundsInParent(child);
    if (!bounds || !intersects(bounds, cull)) continue;
    const iso = env.isolation;
    const dim = iso !== null && !inIsolation && !iso.chain.has(child.id);
    drawNode(env, child, cull, layer, dim ? alpha * DIMMED : alpha, inIsolation || child.id === iso?.id);
  }
}

// ── Artboards and grid (screen space) ──

function drawArtboard(ctx: CanvasRenderingContext2D, board: Artboard, o: RenderOptions): void {
  const { view, dpr, theme } = o;
  const x = board.x * view.zoom + view.panX;
  const y = board.y * view.zoom + view.panY;
  const w = board.w * view.zoom;
  const h = board.h * view.zoom;
  if (x > o.width || y > o.height || x + w < 0 || y + h < 0) return;

  // Soft shadow under the sheet (specs/10 · Lienzo): 0 1px 3px rgba(0,0,0,.4)
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 3 * dpr;
  ctx.shadowOffsetY = 1 * dpr;
  ctx.fillStyle = board.background === 'transparent' ? theme.artboard : colorToCss(board.background);
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  const active = board.id === o.activeArtboardId;
  ctx.lineWidth = 1;
  ctx.strokeStyle = active ? theme.artboardBorderActive : theme.artboardBorder;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);

  const { top, right, bottom, left } = board.bleed;
  if (top || right || bottom || left) {
    ctx.strokeStyle = theme.bleed;
    ctx.strokeRect(
      Math.round(x - left * view.zoom) + 0.5,
      Math.round(y - top * view.zoom) + 0.5,
      Math.round(w + (left + right) * view.zoom) - 1,
      Math.round(h + (top + bottom) * view.zoom) - 1,
    );
  }

  ctx.strokeStyle = theme.artboardBorder;
  if (board.showCenterMark) {
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 6, y + h / 2);
    ctx.lineTo(x + w / 2 + 6, y + h / 2);
    ctx.moveTo(x + w / 2, y + h / 2 - 6);
    ctx.lineTo(x + w / 2, y + h / 2 + 6);
    ctx.stroke();
  }
  if (board.showCrossHairs) {
    ctx.beginPath();
    ctx.moveTo(x - 12, y + h / 2);
    ctx.lineTo(x, y + h / 2);
    ctx.moveTo(x + w, y + h / 2);
    ctx.lineTo(x + w + 12, y + h / 2);
    ctx.moveTo(x + w / 2, y - 12);
    ctx.lineTo(x + w / 2, y);
    ctx.moveTo(x + w / 2, y + h);
    ctx.lineTo(x + w / 2, y + h + 12);
    ctx.stroke();
  }
  if (board.showVideoSafe) {
    ctx.setLineDash([4, 3]);
    for (const k of [0.9, 0.8]) ctx.strokeRect(x + (w * (1 - k)) / 2, y + (h * (1 - k)) / 2, w * k, h * k);
    ctx.setLineDash([]);
  }

  if (w >= 24) {
    ctx.fillStyle = active ? theme.labelActive : theme.label;
    ctx.font = '11px "Inter Variable", Inter, system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(board.name, x, y - 6, Math.max(w, 60));
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, o: RenderOptions): void {
  const { grid } = o.space;
  const { view, theme } = o;
  const subdivisions = Math.max(1, Math.round(grid.subdivisions));
  const majorPx = grid.size * view.zoom;
  if (majorPx < 4) return;
  const minorPx = majorPx / subdivisions;
  const drawLines = (stepPt: number, color: string, skipMajor: boolean) => {
    const rect = visibleRect(view, o.width, o.height);
    ctx.beginPath();
    for (let gx = Math.floor(rect.minX / stepPt) * stepPt; gx <= rect.maxX; gx += stepPt) {
      if (skipMajor && Math.abs(gx / grid.size - Math.round(gx / grid.size)) < 1e-9) continue;
      const sx = Math.round(gx * view.zoom + view.panX) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, o.height);
    }
    for (let gy = Math.floor(rect.minY / stepPt) * stepPt; gy <= rect.maxY; gy += stepPt) {
      if (skipMajor && Math.abs(gy / grid.size - Math.round(gy / grid.size)) < 1e-9) continue;
      const sy = Math.round(gy * view.zoom + view.panY) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(o.width, sy);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  if (subdivisions > 1 && minorPx >= 6) drawLines(grid.size / subdivisions, theme.gridMinor, true);
  drawLines(grid.size, theme.grid, false);
}

/** Paints the Space (artboards, grid and artwork) onto a context that already has size and DPR set up. */
export function renderContent(ctx: CanvasRenderingContext2D, o: RenderOptions): void {
  const { view, dpr } = o;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  if (o.showArtboards) for (const board of o.space.artboards) drawArtboard(ctx, board, o);
  if (o.showGrid) drawGrid(ctx, o);

  // Artwork in document space, culled against the visible rectangle.
  ctx.save();
  ctx.transform(view.zoom * 1, 0, 0, view.zoom * 1, view.panX, view.panY);
  const frame = o.isolatedId ? frameOf(o.space, o.isolatedId) : null;
  const isolation = frame ? { id: o.isolatedId as string, chain: new Set([...frame.ancestors.map((n) => n.id), o.isolatedId as string]) } : null;
  const env: Env = { ctx, resources: o.resources, outline: o.outline, dpr, isolation };
  for (const layer of o.space.layers) {
    if (layer.visible) drawChildren(env, layer.children, visibleRect(view, o.width, o.height), layer, 1, false);
  }
  ctx.restore();
}

import {
  boundsInParent,
  frameOf,
  colorToCss,
  intersects,
  invert,
  isLayer,
  nodeGeometry,
  renderGeometry,
  evaluateNode,
  type Evaluated,
  isGroupShape,
  segmentsOf,
  alignedDash,
  arrowheadAt,
  sortStops,
  colorBetween,
  subPathLength,
  trimSegments,
  variableWidthOutline,
  WIDTH_PROFILES,
  type Segment,
  type SubPath,
  type Vec2,
  transformRect,
  visibleRect,
  type Appearance,
  type AppearanceEffect,
  type Artboard,
  type BlendMode,
  type ImageNode,
  type ImageStore,
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
import { bitmapFor } from './imageCache';
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
  /** Alt+Ctrl+Y: the artwork rasterised at 72 ppi (1 pt = 1 px) and shown with its pixels once zoomed past 100 %. */
  pixelPreview?: boolean;
  showArtboards: boolean;
  showGrid: boolean;
  activeArtboardId: string | null;
  theme: CanvasTheme;
  /** Group being edited in isolation: everything else is dimmed. */
  isolatedId: string | null;
  /** Bytes of the document's images; without them (thumbnails of other documents) images draw as placeholders. */
  images?: ImageStore;
  /** Paint this colour behind everything (an exported picture with a background); default none. */
  background?: string;
  /** Called when an image finishes decoding, so the caller repaints. */
  onImageReady?: () => void;
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

function buildPathOf(geometry: { subpaths: readonly SubPath[] }): Path2D {
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

function buildPath(node: Node): Path2D | null {
  const geometry = renderGeometry(node);
  return geometry ? buildPathOf(geometry) : null;
}

/** Text paths are keyed by their geometry, which changes when the node or the set of loaded fonts does. */
const textPaths = new WeakMap<object, Path2D | null>();

export function pathFor(node: Node): Path2D | null {
  if (node.type === 'text') {
    const geometry = renderGeometry(node);
    if (!geometry) return null;
    if (!textPaths.has(geometry)) textPaths.set(geometry, buildPath(node));
    return textPaths.get(geometry) ?? null;
  }
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
  addStops(gradient, resource.stops);
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

function strokeShape(ctx: CanvasRenderingContext2D, path: Path2D, stroke: StrokeStyle, rule: CanvasFillRule, dash: readonly number[] | null = stroke.dash): void {
  ctx.lineCap = stroke.cap;
  ctx.lineJoin = stroke.join;
  ctx.miterLimit = stroke.miterLimit;
  ctx.setLineDash(dash ? [...dash] : []);
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
  images: ImageStore | undefined;
  onImageReady: (() => void) | undefined;
}

function paintGeometry(env: Env, node: Node, layer: Layer, alpha: number): void {
  const evaluated = evaluateNode(node);
  // Items without modifiers of their own are painted with the contours of the object as a whole.
  const shape = evaluated ? evaluated.paintShape : renderGeometry(node);
  const path = evaluated ? pathOfShape(evaluated.paintShape) : pathFor(node);
  if (!path || !shape) return;
  const { ctx } = env;
  if (env.outline || layer.outline) {
    const t = ctx.getTransform();
    const scale = Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) || 1;
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.lineWidth = env.dpr / scale;
    ctx.strokeStyle = layer.color;
    ctx.stroke(path);
    return;
  }
  paintAppearance(env, path, shape.fillRule, node.appearance, alpha, shape.subpaths, evaluated);
}

const shapePaths = new WeakMap<object, Path2D>();
/** Path2D of an evaluated shape, built once per evaluation. */
function pathOfShape(shape: { subpaths: readonly SubPath[] }): Path2D {
  let p = shapePaths.get(shape);
  if (!p) {
    p = buildPathOf(shape);
    shapePaths.set(shape, p);
  }
  return p;
}

const outlinePaths = new WeakMap<object, Path2D>();
/** Path2D of an Outline Stroke result (of the object, or of one stroke), built once. */
function outlinePathOf(outline: { subpaths: readonly SubPath[] }): Path2D {
  let p = outlinePaths.get(outline);
  if (!p) {
    p = buildPathOf(outline);
    outlinePaths.set(outline, p);
  }
  return p;
}

/** Path2D of a contour given as spans (used when the stroke is trimmed for arrowheads). */
function pathOfSegments(segments: readonly Segment[], closed: boolean): Path2D {
  const path = new Path2D();
  const first = segments[0];
  if (!first) return path;
  path.moveTo(first.p0.x, first.p0.y);
  for (const seg of segments) {
    if (seg.c1 === seg.p0 && seg.c2 === seg.p3) path.lineTo(seg.p3.x, seg.p3.y);
    else path.bezierCurveTo(seg.c1.x, seg.c1.y, seg.c2.x, seg.c2.y, seg.p3.x, seg.p3.y);
  }
  if (closed) path.closePath();
  return path;
}

function polygonPath(points: readonly Vec2[], closed: boolean): Path2D {
  const path = new Path2D();
  points.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
  if (closed) path.closePath();
  return path;
}

/** Gradient stops for the canvas: a stop's midpoint becomes one extra stop so the blend peaks where the user put it. */
function addStops(gradient: CanvasGradient, stops: readonly { offset: number; color: Parameters<typeof colorToCss>[0]; opacity: number; midpoint?: number }[]): void {
  const sorted = sortStops(stops as Parameters<typeof sortStops>[0]);
  sorted.forEach((stop, i) => {
    gradient.addColorStop(Math.min(1, Math.max(0, stop.offset)), colorToCss(stop.color, stop.opacity));
    const next = sorted[i + 1];
    if (next && stop.midpoint !== undefined && Math.abs(stop.midpoint - 0.5) > 0.001) {
      const offset = stop.offset + (next.offset - stop.offset) * stop.midpoint;
      const mid = colorBetween(stop, next, stop.offset + (next.offset - stop.offset) * 0.5);
      gradient.addColorStop(Math.min(1, Math.max(0, offset)), colorToCss(mid.color, mid.opacity));
    }
  });
}

/**
 * Gradient fills are painted in the gradient's own unit space (axis (0,0)→(1,0), unit circle) with the
 * paint transform applied to the canvas, so radial gradients can be ellipses and angles are exact.
 */
function fillGradient(env: Env, path: Path2D, rule: CanvasFillRule, paint: Extract<Paint, { type: 'linear' | 'radial' }>, alpha: number): boolean {
  const { ctx, resources } = env;
  const resource = resources.gradients.find((g) => g.id === paint.gradientId);
  if (!resource || resource.stops.length === 0) return false;
  const inverse = invert(paint.transform);
  if (!inverse) return false;
  const unit = new Path2D();
  unit.addPath(path, { a: inverse[0], b: inverse[1], c: inverse[2], d: inverse[3], e: inverse[4], f: inverse[5] });
  const gradient = paint.type === 'linear' ? ctx.createLinearGradient(0, 0, 1, 0) : ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  addStops(gradient, resource.stops);
  ctx.save();
  ctx.transform(...paint.transform);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.fill(unit, rule);
  ctx.restore();
  return true;
}

function paintStroke(env: Env, path: Path2D, rule: CanvasFillRule, stroke: StrokeStyle, style: string | CanvasGradient, subpaths: readonly SubPath[]): void {
  const { ctx } = env;
  const profile = stroke.profile ? WIDTH_PROFILES[stroke.profile] : undefined;
  const customDash = !!stroke.dash && stroke.dash.length > 0 && stroke.dashAlignToCorners;
  const heads = subpaths.map((sub) => ({ start: arrowheadAt(sub, stroke, 'start'), end: arrowheadAt(sub, stroke, 'end') }));
  const hasHeads = heads.some((h) => h.start || h.end);

  if (profile && stroke.profile !== 'uniform') {
    // Variable width: the stroke is an outline filled with the stroke paint.
    ctx.fillStyle = style;
    for (const sub of subpaths) {
      const polygons = variableWidthOutline(sub, stroke.width, profile, stroke.profileFlip === true);
      if (polygons.length === 0) continue;
      const outline = new Path2D();
      for (const poly of polygons) outline.addPath(polygonPath(poly, true));
      ctx.fill(outline, sub.closed ? 'evenodd' : 'nonzero');
    }
  } else if (hasHeads || customDash) {
    subpaths.forEach((sub, i) => {
      const segs = segmentsOf(sub);
      const head = heads[i];
      const trimmed = head && (head.start || head.end) ? trimSegments(segs, head.start?.trim ?? 0, head.end?.trim ?? 0) : segs;
      const dash = customDash && stroke.dash ? alignedDash(stroke.dash, subPathLength(sub)) : stroke.dash;
      strokeShape(ctx, pathOfSegments(trimmed, sub.closed), stroke, rule, dash);
    });
  } else {
    strokeShape(ctx, path, stroke, rule);
  }

  if (!hasHeads) return;
  ctx.fillStyle = style;
  ctx.strokeStyle = style;
  ctx.setLineDash([]);
  ctx.lineWidth = Math.max(stroke.width, 0.5);
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'round';
  for (const head of heads) {
    for (const h of [head.start, head.end]) {
      if (!h) continue;
      for (const poly of h.fills) ctx.fill(polygonPath(poly, true));
      for (const line of h.lines) ctx.stroke(polygonPath(line, false));
    }
  }
}

/** Far enough off screen that only the shadow of a shape drawn there lands on the canvas. */
const OFFSCREEN = 100000;

/**
 * Shadows and glows are drawn under what they belong to. Its silhouette (`draw`) is cast from outside the
 * canvas, so only the shadow shows; the shadow follows the fills and strokes that `draw` paints.
 */
function paintEffects(env: Env, effects: readonly AppearanceEffect[], alpha: number, draw: () => void): void {
  const { ctx } = env;
  const t = ctx.getTransform();
  const scale = Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) || 1;
  for (const effect of effects) {
    ctx.save();
    ctx.globalAlpha = 1;
    const dx = effect.type === 'shadow' ? effect.dx : 0;
    const dy = effect.type === 'shadow' ? effect.dy : 0;
    ctx.shadowColor = colorToCss(effect.color, effect.opacity * alpha);
    ctx.shadowBlur = effect.blur * scale;
    ctx.shadowOffsetX = t.a * dx + t.c * dy - OFFSCREEN;
    ctx.shadowOffsetY = t.b * dx + t.d * dy;
    ctx.setTransform(t.a, t.b, t.c, t.d, t.e + OFFSCREEN, t.f);
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    draw();
    ctx.restore();
  }
}

/** A fill or stroke as a solid silhouette (what a shadow is cast from). */
function paintSilhouette(env: Env, item: Extract<Appearance['items'][number], { kind: 'fill' | 'stroke' }>, path: Path2D, rule: CanvasFillRule, outline: Path2D | null): void {
  const { ctx } = env;
  if (item.paint.type === 'none' || item.opacity <= 0) return;
  if (item.kind === 'fill') ctx.fill(path, rule);
  else if (outline) ctx.fill(outline, 'nonzero');
  else {
    ctx.lineWidth = item.stroke.width;
    ctx.lineJoin = item.stroke.join;
    ctx.lineCap = item.stroke.cap;
    ctx.miterLimit = item.stroke.miterLimit;
    ctx.stroke(path);
  }
}

function paintAppearance(env: Env, path: Path2D, rule: CanvasFillRule, appearance: Appearance, alpha: number, subpaths: readonly SubPath[] = [], evaluated?: Evaluated | null): void {
  const { ctx, resources } = env;
  const wholeOutline = evaluated?.strokeOutline ? outlinePathOf(evaluated.strokeOutline) : null;
  /** What an item is painted with: its own evaluated geometry when it has modifiers of its own, else the object's. */
  const shapeOf = (index: number) => {
    const own = evaluated?.items.get(index);
    return {
      path: own ? pathOfShape(own.shape) : path,
      rule: (own ? own.shape.fillRule : rule) as CanvasFillRule,
      subpaths: own ? own.geometry.subpaths : subpaths,
      outline: own?.strokeOutline ? outlinePathOf(own.strokeOutline) : wholeOutline,
      effects: own?.effects ?? [],
    };
  };
  // Effects of the object as a whole come first, cast by every fill and stroke together.
  if (evaluated && evaluated.effects.length > 0) {
    paintEffects(env, evaluated.effects, alpha, () => {
      appearance.items.forEach((item, index) => {
        if (item.kind === 'modifier') return;
        const sh = shapeOf(index);
        paintSilhouette(env, item, sh.path, sh.rule, sh.outline);
      });
    });
  }
  appearance.items.forEach((item, index) => {
    if (item.kind === 'modifier' || item.opacity <= 0) return; // modifiers act through the evaluated geometry and effects
    const sh = shapeOf(index);
    // Effects of this fill or stroke alone are cast by it only.
    if (sh.effects.length > 0) paintEffects(env, sh.effects, alpha * item.opacity, () => paintSilhouette(env, item, sh.path, sh.rule, sh.outline));
    if (item.kind === 'fill' && (item.paint.type === 'linear' || item.paint.type === 'radial')) {
      if (fillGradient(env, sh.path, sh.rule, item.paint, alpha * item.opacity)) return;
    }
    const style = paintStyle(ctx, item.paint, resources);
    if (style === null) return;
    ctx.globalAlpha = alpha * item.opacity;
    if (item.kind === 'fill') {
      ctx.fillStyle = style;
      ctx.fill(sh.path, sh.rule);
    } else if (sh.outline) {
      // Outline Stroke: the stroke is a filled contour painted with the stroke's paint.
      ctx.fillStyle = style;
      ctx.fill(sh.outline, 'nonzero');
    } else {
      ctx.strokeStyle = style;
      paintStroke(env, sh.path, sh.rule, item.stroke, style, sh.subpaths);
    }
  });
}

function drawImage(env: Env, node: ImageNode, alpha: number): void {
  const bitmap = env.images ? bitmapFor(env.images, node.resourceId, env.onImageReady) : null;
  if (!bitmap) {
    drawPlaceholderImage(env, node.width, node.height);
    return;
  }
  const { ctx } = env;
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, node.width, node.height);
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
      if (isGroupShape(node)) paintGeometry(env, node, layer, a);
      else drawChildren(env, node.children, localCull, layer, a, inIsolation);
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
      drawImage(env, node, a);
      break;
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
  if (o.background) {
    ctx.fillStyle = o.background;
    ctx.fillRect(0, 0, o.width, o.height);
  }

  if (o.showArtboards) for (const board of o.space.artboards) drawArtboard(ctx, board, o);
  if (o.showGrid) drawGrid(ctx, o);

  const raster = o.pixelPreview && !o.outline && view.zoom > 1 ? rasteriseArtwork(o) : null;
  if (raster) {
    ctx.save();
    ctx.transform(view.zoom, 0, 0, view.zoom, view.panX, view.panY);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(raster.canvas, raster.x, raster.y);
    ctx.restore();
    return;
  }
  drawArtwork(ctx, o, view, o.width, o.height, dpr);
}

/** Artwork in document space, culled against the visible rectangle. */
function drawArtwork(ctx: CanvasRenderingContext2D, o: RenderOptions, view: Viewport, width: number, height: number, dpr: number): void {
  ctx.save();
  ctx.transform(view.zoom, 0, 0, view.zoom, view.panX, view.panY);
  const frame = o.isolatedId ? frameOf(o.space, o.isolatedId) : null;
  const isolation = frame ? { id: o.isolatedId as string, chain: new Set([...frame.ancestors.map((n) => n.id), o.isolatedId as string]) } : null;
  const env: Env = { ctx, resources: o.resources, outline: o.outline, dpr, isolation, images: o.images, onImageReady: o.onImageReady };
  for (const layer of o.space.layers) {
    if (layer.visible) drawChildren(env, layer.children, visibleRect(view, width, height), layer, 1, false);
  }
  ctx.restore();
}

/** Largest raster Previsualizar píxeles builds; beyond it the artwork is drawn normally. */
const MAX_PIXEL_PREVIEW = 16 * 1024 * 1024;

/** The visible part of the artwork drawn at 1 px per pt, on whole points so its pixels line up with the document. */
function rasteriseArtwork(o: RenderOptions): { canvas: HTMLCanvasElement; x: number; y: number } | null {
  const area = visibleRect(o.view, o.width, o.height);
  const x = Math.floor(area.minX);
  const y = Math.floor(area.minY);
  const w = Math.ceil(area.maxX) - x;
  const h = Math.ceil(area.maxY) - y;
  if (w <= 0 || h <= 0 || w * h > MAX_PIXEL_PREVIEW) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawArtwork(ctx, o, { zoom: 1, panX: -x, panY: -y }, w, h, 1);
  return { canvas, x, y };
}

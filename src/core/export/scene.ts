import type { FillRule } from '../geometry/booleans';
import { evaluateNode, type Evaluated } from '../modifiers/evaluate';
import type { AppearanceEffect } from '../modifiers/types';
import { isGroupShape, nodeGeometry, renderGeometry, boundsInParent, type NodeGeometry } from '../geometry/geometry';
import { segmentsOf, type Segment, type SubPath } from '../geometry/path';
import { intersects, transformRect, type Rect } from '../geometry/rect';
import { alignedDash, arrowheadAt, subPathLength, trimSegments, variableWidthOutline, WIDTH_PROFILES } from '../geometry/stroke';
import { colorBetween, sortStops } from '../model/gradient';
import { colorToRgb } from '../model/color';
import { IDENTITY, invert, isIdentity, translation } from '../model/matrix';
import { isLayer } from '../model/queries';
import type { Appearance, BlendMode, Layer, LayerChild, Matrix, Node, Paint, Resources, Space, StrokeStyle, Vec2 } from '../model/types';

// The scene is what an export draws: the evaluated geometry of every visible object, already resolved into
// plain fills, strokes, images and groups. SVG and PDF writers read the same scene, so they cannot disagree
// with each other (specs/12 · Riesgos: un único pipeline de geometría evaluada). It follows the canvas painter
// step by step: modifiers, Outline Stroke, width profiles, arrowheads, aligned dashes and effects.

export interface SceneContour {
  segments: Segment[];
  closed: boolean;
}

export interface ScenePath {
  contours: SceneContour[];
  rule: FillRule;
}

export type RGB = [number, number, number];

export interface SceneStop {
  offset: number;
  rgb: RGB;
  alpha: number;
}

export type ScenePaint =
  | { kind: 'solid'; rgb: RGB; alpha: number }
  /** The gradient lives in its own unit space (axis (0,0)→(1,0), unit circle); `transform` takes it to the local space. */
  | { kind: 'gradient'; type: 'linear' | 'radial'; transform: Matrix; stops: SceneStop[] };

/** A shadow or glow: the group's children are its black silhouette, and only the shadow is drawn (the object follows). */
export interface SceneEffect {
  type: AppearanceEffect['type'];
  rgb: RGB;
  opacity: number;
  dx: number;
  dy: number;
  blur: number;
}

export type SceneOp =
  | { kind: 'fill'; path: ScenePath; paint: ScenePaint; opacity: number }
  | {
      kind: 'stroke';
      path: ScenePath;
      paint: ScenePaint;
      opacity: number;
      width: number;
      cap: StrokeStyle['cap'];
      join: StrokeStyle['join'];
      miterLimit: number;
      dash: number[] | null;
      /** Inside and outside strokes are drawn twice as wide and clipped to one side of `path`. */
      align: StrokeStyle['align'];
    }
  | { kind: 'image'; hash: string; width: number; height: number }
  | {
      kind: 'group';
      matrix: Matrix;
      opacity: number;
      blend: BlendMode;
      clip: { path: ScenePath; matrix: Matrix } | null;
      effect: SceneEffect | null;
      children: SceneOp[];
    };

export interface Scene {
  /** Size of the drawing in pt. */
  width: number;
  height: number;
  /** 'transparent' or an RGB colour painted behind everything. */
  background: 'transparent' | RGB;
  ops: SceneOp[];
}

// ── Paths ───────────────────────────────────────────────────────────────────────

const isStraight = (s: Segment): boolean =>
  s.c1.x === s.p0.x && s.c1.y === s.p0.y && s.c2.x === s.p3.x && s.c2.y === s.p3.y;
export const segmentIsStraight = isStraight;

export function pathOfSubPaths(subpaths: readonly SubPath[], rule: FillRule): ScenePath {
  const contours: SceneContour[] = [];
  for (const sub of subpaths) {
    const segments = segmentsOf(sub);
    if (segments.length > 0) contours.push({ segments, closed: sub.closed });
  }
  return { contours, rule };
}

function pathOfSegments(segments: readonly Segment[], closed: boolean, rule: FillRule): ScenePath {
  return { contours: segments.length > 0 ? [{ segments: [...segments], closed }] : [], rule };
}

export function pathOfPolygons(polygons: readonly (readonly Vec2[])[], closed: boolean, rule: FillRule): ScenePath {
  const contours: SceneContour[] = [];
  for (const points of polygons) {
    const segments: Segment[] = [];
    const n = closed ? points.length : points.length - 1;
    for (let i = 0; i < n; i++) {
      const a = points[i] as Vec2;
      const b = points[(i + 1) % points.length] as Vec2;
      segments.push({ p0: a, c1: a, c2: b, p3: b });
    }
    if (segments.length > 0) contours.push({ segments, closed });
  }
  return { contours, rule };
}

const BIG = 1e7;
/** Outside strokes keep what is outside the shape: a huge rectangle with the shape cut out of it (even-odd). */
export function outsideClipPath(path: ScenePath): ScenePath {
  const corners: Vec2[] = [{ x: -BIG, y: -BIG }, { x: BIG, y: -BIG }, { x: BIG, y: BIG }, { x: -BIG, y: BIG }];
  const frame = pathOfPolygons([corners], true, 'evenodd');
  return { contours: [...frame.contours, ...path.contours], rule: 'evenodd' };
}

// ── Paint ───────────────────────────────────────────────────────────────────────

function solid(color: Parameters<typeof colorToRgb>[0], alpha = 1): ScenePaint {
  return { kind: 'solid', rgb: colorToRgb(color), alpha: Math.min(1, Math.max(0, (color.alpha ?? 1) * alpha)) };
}

const BLACK: ScenePaint = { kind: 'solid', rgb: [0, 0, 0], alpha: 1 };

/** Stops with each midpoint turned into one more stop, as the canvas does. */
function resolveStops(resource: Resources['gradients'][number]): SceneStop[] {
  const sorted = sortStops(resource.stops);
  const out: SceneStop[] = [];
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  sorted.forEach((stop, i) => {
    out.push({ offset: clamp(stop.offset), rgb: colorToRgb(stop.color), alpha: stop.opacity * (stop.color.alpha ?? 1) });
    const next = sorted[i + 1];
    if (next && stop.midpoint !== undefined && Math.abs(stop.midpoint - 0.5) > 0.001) {
      const offset = stop.offset + (next.offset - stop.offset) * stop.midpoint;
      const mid = colorBetween(stop, next, stop.offset + (next.offset - stop.offset) * 0.5);
      out.push({ offset: clamp(offset), rgb: colorToRgb(mid.color), alpha: mid.opacity * (mid.color.alpha ?? 1) });
    }
  });
  return out;
}

function paintOf(paint: Paint, resources: Resources): ScenePaint | null {
  switch (paint.type) {
    case 'none':
      return null;
    case 'solid':
      return solid(paint.color);
    case 'swatch': {
      const swatch = resources.swatches.find((s) => s.id === paint.swatchId);
      return swatch ? solid(swatch.color) : null;
    }
    default: {
      const resource = resources.gradients.find((g) => g.id === paint.gradientId);
      if (!resource || resource.stops.length === 0 || !invert(paint.transform)) return null;
      return { kind: 'gradient', type: paint.type, transform: paint.transform, stops: resolveStops(resource) };
    }
  }
}

// ── Objects ─────────────────────────────────────────────────────────────────────

interface Context {
  resources: Resources;
}

const group = (matrix: Matrix, opacity: number, blend: BlendMode, children: SceneOp[], clip: { path: ScenePath; matrix: Matrix } | null = null, effect: SceneEffect | null = null): SceneOp => ({
  kind: 'group',
  matrix,
  opacity,
  blend,
  clip,
  effect,
  children,
});

type Item = Extract<Appearance['items'][number], { kind: 'fill' | 'stroke' }>;

interface ItemShape {
  path: ScenePath;
  rule: FillRule;
  subpaths: readonly SubPath[];
  outline: ScenePath | null;
  effects: readonly AppearanceEffect[];
}

function strokeOps(item: Extract<Item, { kind: 'stroke' }>, paint: ScenePaint, sh: ItemShape): SceneOp[] {
  const stroke = item.stroke;
  const ops: SceneOp[] = [];
  if (sh.outline) {
    // Outline Stroke: the stroke is a filled contour painted with the stroke's paint.
    return [{ kind: 'fill', path: sh.outline, paint, opacity: item.opacity }];
  }
  const profile = stroke.profile ? WIDTH_PROFILES[stroke.profile] : undefined;
  const customDash = !!stroke.dash && stroke.dash.length > 0 && stroke.dashAlignToCorners;
  const heads = sh.subpaths.map((sub) => ({ start: arrowheadAt(sub, stroke, 'start'), end: arrowheadAt(sub, stroke, 'end') }));
  const hasHeads = heads.some((h) => h.start || h.end);
  const plain = (path: ScenePath, dash: number[] | null): SceneOp => ({
    kind: 'stroke',
    path,
    paint,
    opacity: item.opacity,
    width: stroke.width,
    cap: stroke.cap,
    join: stroke.join,
    miterLimit: stroke.miterLimit,
    dash,
    align: stroke.align,
  });

  if (profile && stroke.profile !== 'uniform') {
    for (const sub of sh.subpaths) {
      const polygons = variableWidthOutline(sub, stroke.width, profile, stroke.profileFlip === true);
      if (polygons.length > 0) ops.push({ kind: 'fill', path: pathOfPolygons(polygons, true, sub.closed ? 'evenodd' : 'nonzero'), paint, opacity: item.opacity });
    }
  } else if (hasHeads || customDash) {
    sh.subpaths.forEach((sub, i) => {
      const segs = segmentsOf(sub);
      const head = heads[i];
      const trimmed = head && (head.start || head.end) ? trimSegments(segs, head.start?.trim ?? 0, head.end?.trim ?? 0) : segs;
      const dash = customDash && stroke.dash ? alignedDash(stroke.dash, subPathLength(sub)) : stroke.dash;
      ops.push(plain(pathOfSegments(trimmed, sub.closed, sh.rule), dash ? [...dash] : null));
    });
  } else {
    ops.push(plain(sh.path, stroke.dash ? [...stroke.dash] : null));
  }

  if (hasHeads) {
    for (const head of heads) {
      for (const h of [head.start, head.end]) {
        if (!h) continue;
        if (h.fills.length > 0) ops.push({ kind: 'fill', path: pathOfPolygons(h.fills, true, 'nonzero'), paint, opacity: item.opacity });
        if (h.lines.length > 0) {
          ops.push({
            kind: 'stroke',
            path: pathOfPolygons(h.lines, false, 'nonzero'),
            paint,
            opacity: item.opacity,
            width: Math.max(stroke.width, 0.5),
            cap: 'round',
            join: 'miter',
            miterLimit: stroke.miterLimit,
            dash: null,
            align: 'center',
          });
        }
      }
    }
  }
  return ops;
}

/** A fill or stroke as a solid black silhouette: what a shadow is cast from. */
function silhouetteOps(item: Item, sh: ItemShape): SceneOp[] {
  if (item.paint.type === 'none' || item.opacity <= 0) return [];
  if (item.kind === 'fill') return [{ kind: 'fill', path: sh.path, paint: BLACK, opacity: 1 }];
  if (sh.outline) return [{ kind: 'fill', path: sh.outline, paint: BLACK, opacity: 1 }];
  return [
    {
      kind: 'stroke',
      path: sh.path,
      paint: BLACK,
      opacity: 1,
      width: item.stroke.width,
      cap: item.stroke.cap,
      join: item.stroke.join,
      miterLimit: item.stroke.miterLimit,
      dash: null,
      align: 'center',
    },
  ];
}

const effectOf = (effect: AppearanceEffect, opacity: number): SceneEffect => ({
  type: effect.type,
  rgb: colorToRgb(effect.color),
  opacity: Math.min(1, Math.max(0, effect.opacity * (effect.color.alpha ?? 1) * opacity)),
  dx: effect.type === 'shadow' ? effect.dx : 0,
  dy: effect.type === 'shadow' ? effect.dy : 0,
  blur: effect.blur,
});

function geometryOps(node: Node, ctx: Context): SceneOp[] {
  const evaluated: Evaluated | null = evaluateNode(node);
  const shape: NodeGeometry | null = evaluated ? evaluated.paintShape : renderGeometry(node);
  if (!shape) return [];
  const basePath = pathOfSubPaths(shape.subpaths, shape.fillRule);
  const wholeOutline = evaluated?.strokeOutline ? pathOfSubPaths(evaluated.strokeOutline.subpaths, 'nonzero') : null;
  const shapeOf = (index: number): ItemShape => {
    const own = evaluated?.items.get(index);
    return {
      path: own ? pathOfSubPaths(own.shape.subpaths, own.shape.fillRule) : basePath,
      rule: own ? own.shape.fillRule : shape.fillRule,
      subpaths: own ? own.geometry.subpaths : shape.subpaths,
      outline: own?.strokeOutline ? pathOfSubPaths(own.strokeOutline.subpaths, 'nonzero') : wholeOutline,
      effects: own?.effects ?? [],
    };
  };

  const ops: SceneOp[] = [];
  // Effects of the object as a whole come first, cast by every fill and stroke together.
  if (evaluated && evaluated.effects.length > 0) {
    const silhouette: SceneOp[] = [];
    node.appearance.items.forEach((item, index) => {
      if (item.kind !== 'modifier') silhouette.push(...silhouetteOps(item, shapeOf(index)));
    });
    for (const effect of evaluated.effects) ops.push(group(IDENTITY, 1, 'normal', silhouette, null, effectOf(effect, 1)));
  }

  node.appearance.items.forEach((item, index) => {
    if (item.kind === 'modifier' || item.opacity <= 0) return;
    const sh = shapeOf(index);
    for (const effect of sh.effects) ops.push(group(IDENTITY, 1, 'normal', silhouetteOps(item, sh), null, effectOf(effect, item.opacity)));
    const paint = paintOf(item.paint, ctx.resources);
    if (!paint) return;
    if (item.kind === 'fill') ops.push({ kind: 'fill', path: sh.path, paint, opacity: item.opacity });
    else ops.push(...strokeOps(item, paint, sh));
  });
  return ops;
}

function nodeOps(node: Node, cull: Rect, ctx: Context): SceneOp | null {
  if (!node.visible) return null;
  const inverse = invert(node.transform);
  const localCull = inverse ? transformRect(inverse, cull) : cull;
  let children: SceneOp[];
  let clip: { path: ScenePath; matrix: Matrix } | null = null;
  switch (node.type) {
    case 'group':
      children = isGroupShape(node) ? geometryOps(node, ctx) : childOps(node.children, localCull, ctx);
      break;
    case 'clipGroup': {
      const [mask, ...rest] = node.children;
      const geometry = mask ? nodeGeometry(mask) : null;
      if (!mask || !geometry) return null;
      clip = { path: pathOfSubPaths(geometry.subpaths, geometry.fillRule), matrix: mask.transform };
      children = childOps(rest, localCull, ctx);
      break;
    }
    case 'image':
      children = [{ kind: 'image', hash: node.resourceId, width: node.width, height: node.height }];
      break;
    default:
      children = geometryOps(node, ctx);
  }
  if (children.length === 0) return null;
  return group(node.transform, node.opacity, node.blendMode, children, clip);
}

function childOps(children: readonly LayerChild[], cull: Rect, ctx: Context): SceneOp[] {
  const out: SceneOp[] = [];
  for (const child of children) {
    if (isLayer(child)) {
      if (child.visible) out.push(...childOps(child.children, cull, ctx));
      continue;
    }
    if (!child.visible) continue;
    const bounds = boundsInParent(child);
    if (!bounds || !intersects(bounds, cull)) continue;
    const op = nodeOps(child, cull, ctx);
    if (op) out.push(op);
  }
  return out;
}

export interface SceneOptions {
  resources: Resources;
  /** What to draw, in Space coordinates (an artboard, with its bleed if asked). */
  region: Rect;
  background?: 'transparent' | RGB;
}

/** Drawing of one rectangle of a Space: the region's top-left corner becomes (0, 0). */
export function buildScene(space: Space, options: SceneOptions): Scene {
  const { region } = options;
  const ctx: Context = { resources: options.resources };
  const layers: readonly Layer[] = space.layers;
  const ops: SceneOp[] = [];
  for (const layer of layers) {
    if (layer.visible) ops.push(...childOps(layer.children, region, ctx));
  }
  const shift = translation(-region.minX, -region.minY);
  return {
    width: region.maxX - region.minX,
    height: region.maxY - region.minY,
    background: options.background ?? 'transparent',
    ops: isIdentity(shift) ? ops : [group(shift, 1, 'normal', ops)],
  };
}

import { strFromU8 } from 'fflate';
import { createImage } from '../../commands/image';
import { fromBase64 } from '../../export/base64';
import { geometryBounds, nodeGeometry } from '../../geometry/geometry';
import type { Rect } from '../../geometry/rect';
import { createClipGroup, createCompound, createEllipse, createGroup, createPath, createRect, createText, defaultStroke } from '../../model/factory';
import type { IdGenerator } from '../../model/ids';
import { IDENTITY, multiply, scaling, translation } from '../../model/matrix';
import type { Anchor, Appearance, AppearanceItem, BlendMode, Gradient, GradientStop, ImageResource, Matrix, Node, Paint, ParagraphStyle, StrokeStyle, TextRun, TextStyle } from '../../model/types';
import { hashBytes } from '../imageStore';
import { sniffImage } from '../imageInfo';
import { parsePathData, type PathContour } from './pathData';
import {
  isPhysicalUnit,
  numberList,
  parseColor,
  parseDeclarations,
  parseStylesheet,
  parseTransform,
  ruleMatches,
  splitLength,
  toUserUnits,
  type ColorValue,
  type CssRule,
  type ParsedColor,
} from './style';
import { parseXml, textContent, XmlError, type XmlElement } from './xml';

// SVG import (specs/02 · Importar / exportar). It reads what drawing programs write: shapes and paths, groups and
// `<use>`, transforms, presentation attributes, `<style>` with simple selectors, solid colours and gradients,
// clip paths, embedded images and simple text. What it cannot represent is listed in `warnings` instead of failing.

export interface SvgWarning {
  code: 'text-path' | 'mask' | 'filter' | 'pattern' | 'external-image' | 'svg-image' | 'selector' | 'path' | 'element' | 'gradient' | 'clip' | 'use' | 'size';
  detail?: string;
}

export interface SvgImport {
  /** Size of the drawing in pt: the size of the artboard. */
  width: number;
  height: number;
  /** Top-level objects in painting order, already in artboard coordinates. */
  nodes: Node[];
  gradients: Gradient[];
  /** Embedded pictures by content hash (the same keys as `resources.images`). */
  images: Record<string, { resource: ImageResource; bytes: Uint8Array }>;
  warnings: SvgWarning[];
}

export class SvgImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SvgImportError';
  }
}

const MAX_ELEMENTS = 250_000;
const MAX_USE_DEPTH = 12;
const DEFAULT_SIZE = 100;

interface Style {
  fill: ColorValue | { url: string };
  fillOpacity: number;
  fillRule: 'nonzero' | 'evenodd';
  stroke: ColorValue | { url: string };
  strokeOpacity: number;
  strokeWidth: number;
  linecap: StrokeStyle['cap'];
  linejoin: StrokeStyle['join'];
  miterLimit: number;
  dash: number[] | null;
  color: ParsedColor;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  textAnchor: 'start' | 'middle' | 'end';
}

const ROOT_STYLE: Style = {
  fill: { rgb: [0, 0, 0], alpha: 1 },
  fillOpacity: 1,
  fillRule: 'nonzero',
  stroke: 'none',
  strokeOpacity: 1,
  strokeWidth: 1,
  linecap: 'butt',
  linejoin: 'miter',
  miterLimit: 4,
  dash: null,
  color: { rgb: [0, 0, 0], alpha: 1 },
  fontFamily: 'sans-serif',
  fontSize: 16,
  bold: false,
  italic: false,
  textAnchor: 'start',
};

/** Properties that take part in the cascade (presentation attributes, CSS and `style=""`). */
const PROPERTIES = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
  'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'opacity', 'display', 'visibility', 'clip-path', 'mix-blend-mode', 'stop-color', 'stop-opacity', 'mask', 'filter',
]);

interface Context {
  ids: IdGenerator;
  rules: CssRule[];
  byId: Map<string, XmlElement>;
  warnings: SvgWarning[];
  gradients: Gradient[];
  gradientCache: Map<string, GradientSpec | null>;
  images: SvgImport['images'];
  /** Reference length for percentages: the diagonal of the viewport / sqrt(2). */
  viewport: { w: number; h: number };
  elements: number;
  useStack: string[];
}

interface GradientSpec {
  gradient: Gradient;
  kind: 'linear' | 'radial';
  attrs: Record<string, string>;
}

const warn = (ctx: Context, code: SvgWarning['code'], detail?: string) => {
  if (!ctx.warnings.some((w) => w.code === code && w.detail === detail)) ctx.warnings.push(detail === undefined ? { code } : { code, detail });
};

const localName = (name: string) => name.slice(name.indexOf(':') + 1);
const elementsOf = (el: XmlElement): XmlElement[] => el.children.filter((c): c is XmlElement => typeof c !== 'string');

function declaredStyle(el: XmlElement, ctx: Context): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(el.attrs)) if (PROPERTIES.has(key)) out[key] = value.trim();
  const tag = localName(el.name);
  const classes = (el.attrs.class ?? '').split(/\s+/).filter((c) => c.length > 0);
  const matched = ctx.rules.filter((r) => ruleMatches(r, tag, el.attrs.id, classes)).sort((a, b) => a.specificity - b.specificity);
  for (const rule of matched) for (const [k, v] of Object.entries(rule.declarations)) if (PROPERTIES.has(k)) out[k] = v;
  if (el.attrs.style) for (const [k, v] of Object.entries(parseDeclarations(el.attrs.style))) if (PROPERTIES.has(k)) out[k] = v;
  return out;
}

const urlOf = (value: string): string | null => /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/.exec(value)?.[1] ?? null;

function paintOf(value: string | undefined, fallback: Style['fill']): Style['fill'] {
  if (value === undefined) return fallback;
  const url = urlOf(value);
  if (url) return { url };
  return parseColor(value) ?? fallback;
}

function computeStyle(parent: Style, d: Record<string, string>, ctx: Context): Style {
  const style: Style = { ...parent };
  const color = d.color === undefined ? null : parseColor(d.color);
  if (color && typeof color === 'object') style.color = color;
  style.fill = paintOf(d.fill, style.fill);
  style.stroke = paintOf(d.stroke, style.stroke);
  const num = (v: string | undefined, fallback: number) => {
    const n = v === undefined ? Number.NaN : Number.parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const opacity = (v: string | undefined, fallback: number) => {
    if (v === undefined) return fallback;
    const n = v.endsWith('%') ? Number.parseFloat(v) / 100 : Number.parseFloat(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
  };
  style.fillOpacity = opacity(d['fill-opacity'], style.fillOpacity);
  style.strokeOpacity = opacity(d['stroke-opacity'], style.strokeOpacity);
  if (d['fill-rule'] === 'evenodd' || d['fill-rule'] === 'nonzero') style.fillRule = d['fill-rule'];
  if (d['font-size'] !== undefined) style.fontSize = toUserUnits(d['font-size'], parent.fontSize, parent.fontSize) ?? style.fontSize;
  const width = d['stroke-width'] === undefined ? null : toUserUnits(d['stroke-width'], Math.hypot(ctx.viewport.w, ctx.viewport.h) / Math.SQRT2, style.fontSize);
  if (width !== null) style.strokeWidth = Math.max(0, width);
  if (d['stroke-linecap'] === 'butt' || d['stroke-linecap'] === 'round' || d['stroke-linecap'] === 'square') style.linecap = d['stroke-linecap'];
  if (d['stroke-linejoin'] === 'round' || d['stroke-linejoin'] === 'bevel') style.linejoin = d['stroke-linejoin'];
  else if (d['stroke-linejoin'] !== undefined) style.linejoin = 'miter';
  style.miterLimit = Math.max(1, num(d['stroke-miterlimit'], style.miterLimit));
  if (d['stroke-dasharray'] !== undefined) {
    const list = d['stroke-dasharray'] === 'none' ? [] : numberList(d['stroke-dasharray']);
    style.dash = list.length > 0 && list.every((n) => n >= 0) && list.some((n) => n > 0) ? (list.length % 2 === 1 ? [...list, ...list] : list) : null;
  }
  if (d['font-family'] !== undefined) style.fontFamily = d['font-family'];
  if (d['font-weight'] !== undefined) style.bold = d['font-weight'] === 'bold' || d['font-weight'] === 'bolder' || Number.parseInt(d['font-weight'], 10) >= 600;
  if (d['font-style'] !== undefined) style.italic = d['font-style'] === 'italic' || d['font-style'] === 'oblique';
  if (d['text-anchor'] === 'middle' || d['text-anchor'] === 'end' || d['text-anchor'] === 'start') style.textAnchor = d['text-anchor'];
  return style;
}

const solid = (c: ParsedColor): Paint => ({ type: 'solid', color: { model: 'rgb', values: [...c.rgb] } });

// ── Gradients ───────────────────────────────────────────────────────────────────

function gradientSpec(id: string, ctx: Context): GradientSpec | null {
  if (ctx.gradientCache.has(id)) return ctx.gradientCache.get(id) ?? null;
  ctx.gradientCache.set(id, null);
  const el = ctx.byId.get(id);
  const tag = el ? localName(el.name) : '';
  if (!el || (tag !== 'linearGradient' && tag !== 'radialGradient')) return null;

  // Attributes and stops come from the element or, failing that, the gradient it refers to.
  const chain: XmlElement[] = [];
  let cur: XmlElement | undefined = el;
  while (cur && chain.length < 16 && !chain.includes(cur)) {
    chain.push(cur);
    const href: string = (cur.attrs['xlink:href'] ?? cur.attrs.href ?? '').replace(/^#/, '');
    const next: XmlElement | undefined = href ? ctx.byId.get(href) : undefined;
    cur = next && /^(linear|radial)Gradient$/.test(localName(next.name)) ? next : undefined;
  }
  const attrs: Record<string, string> = {};
  for (const link of [...chain].reverse()) Object.assign(attrs, link.attrs);
  const withStops = chain.find((c) => elementsOf(c).some((e) => localName(e.name) === 'stop'));
  const stops: GradientStop[] = [];
  let previous = 0;
  for (const stop of elementsOf(withStops ?? el).filter((e) => localName(e.name) === 'stop')) {
    const d = { ...stop.attrs, ...parseDeclarations(stop.attrs.style ?? '') } as Record<string, string>;
    const raw = d.offset?.trim() ?? '0';
    const offset = Math.min(1, Math.max(previous, raw.endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw) || 0));
    previous = offset;
    const parsed = d['stop-color'] === undefined ? { rgb: [0, 0, 0] as [number, number, number], alpha: 1 } : parseColor(d['stop-color']);
    const color = parsed && typeof parsed === 'object' ? parsed : { rgb: [0, 0, 0] as [number, number, number], alpha: 1 };
    const opacity = Math.min(1, Math.max(0, Number.parseFloat(d['stop-opacity'] ?? '1') || (d['stop-opacity'] === '0' ? 0 : 1)));
    stops.push({ offset, color: { model: 'rgb', values: [...color.rgb] }, opacity: opacity * color.alpha });
  }
  if (stops.length === 0) return null;
  const spec: GradientSpec = { gradient: { id: ctx.ids(), name: id, type: tag === 'linearGradient' ? 'linear' : 'radial', stops }, kind: tag === 'linearGradient' ? 'linear' : 'radial', attrs };
  if (attrs.spreadMethod && attrs.spreadMethod !== 'pad') warn(ctx, 'gradient', 'spreadMethod');
  ctx.gradientCache.set(id, spec);
  if (stops.length > 1) ctx.gradients.push(spec.gradient);
  return spec;
}

/** The paint for `url(#id)` on an object whose geometric bounds (in its own space) are `bbox`. */
function urlPaint(id: string, bbox: Rect | null, ctx: Context): Paint | null {
  const spec = gradientSpec(id, ctx);
  if (!spec) {
    const target = ctx.byId.get(id);
    warn(ctx, localName(target?.name ?? '') === 'pattern' ? 'pattern' : 'gradient', id);
    return null;
  }
  const { gradient, attrs, kind } = spec;
  if (gradient.stops.length === 1) {
    const only = gradient.stops[0] as GradientStop;
    return { type: 'solid', color: only.color };
  }
  const units = attrs.gradientUnits === 'userSpaceOnUse' ? 'user' : 'box';
  const w = bbox ? bbox.maxX - bbox.minX : 0;
  const h = bbox ? bbox.maxY - bbox.minY : 0;
  if (units === 'box' && (!bbox || w <= 0 || h <= 0)) return null;
  const ref = Math.hypot(ctx.viewport.w, ctx.viewport.h) / Math.SQRT2;
  const coord = (key: string, fallback: string, axis: 'x' | 'y' | 'r'): number => {
    const text = attrs[key] ?? fallback;
    if (units === 'box') {
      const l = splitLength(text);
      return l ? (l.unit === '%' ? l.value / 100 : l.value) : 0;
    }
    return toUserUnits(text, axis === 'x' ? ctx.viewport.w : axis === 'y' ? ctx.viewport.h : ref) ?? 0;
  };
  let axis: Matrix;
  if (kind === 'linear') {
    const x1 = coord('x1', '0%', 'x');
    const y1 = coord('y1', '0%', 'y');
    const x2 = coord('x2', '100%', 'x');
    const y2 = coord('y2', '0%', 'y');
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return { type: 'solid', color: (gradient.stops[gradient.stops.length - 1] as GradientStop).color };
    axis = [dx, dy, -dy, dx, x1, y1];
  } else {
    const cx = coord('cx', '50%', 'x');
    const cy = coord('cy', '50%', 'y');
    const r = coord('r', '50%', 'r');
    if (r <= 0) return { type: 'solid', color: (gradient.stops[gradient.stops.length - 1] as GradientStop).color };
    if ((attrs.fx !== undefined && coord('fx', '50%', 'x') !== cx) || (attrs.fy !== undefined && coord('fy', '50%', 'y') !== cy)) warn(ctx, 'gradient', 'focal point');
    axis = [r, 0, 0, r, cx, cy];
  }
  const own = parseTransform(attrs.gradientTransform) ?? IDENTITY;
  let transform = multiply(own, axis);
  if (units === 'box' && bbox) transform = multiply([w, 0, 0, h, bbox.minX, bbox.minY], transform);
  return { type: kind, gradientId: gradient.id, transform };
}

// ── Appearance ──────────────────────────────────────────────────────────────────

function appearanceOf(style: Style, bbox: Rect | null, ctx: Context): Appearance {
  const items: AppearanceItem[] = [];
  const resolve = (value: Style['fill']): { paint: Paint; alpha: number } | null => {
    if (value === 'none') return null;
    if (typeof value === 'object' && 'url' in value) {
      const paint = urlPaint(value.url, bbox, ctx);
      return paint ? { paint, alpha: 1 } : null;
    }
    const color = value === 'currentColor' ? style.color : value;
    return color.alpha <= 0 ? null : { paint: solid(color), alpha: color.alpha };
  };
  const fill = resolve(style.fill);
  if (fill) items.push({ kind: 'fill', paint: fill.paint, opacity: fill.alpha * style.fillOpacity, modifiers: [] });
  const stroke = style.strokeWidth > 0 ? resolve(style.stroke) : null;
  if (stroke) {
    const s: StrokeStyle = { ...defaultStroke(), width: style.strokeWidth, cap: style.linecap, join: style.linejoin, miterLimit: style.miterLimit, dash: style.dash };
    items.push({ kind: 'stroke', paint: stroke.paint, stroke: s, opacity: stroke.alpha * style.strokeOpacity, modifiers: [] });
  }
  return { items };
}

// ── Geometry ────────────────────────────────────────────────────────────────────

const length = (el: XmlElement, key: string, ref: number, ctx: Context, style: Style): number => toUserUnits(el.attrs[key], ref, style.fontSize) ?? 0;

/** Path data of a basic shape (so clip paths and rounded rectangles can share the path reader). */
function shapeData(el: XmlElement, ctx: Context, style: Style): string | null {
  const { w: vw, h: vh } = ctx.viewport;
  switch (localName(el.name)) {
    case 'path':
      return el.attrs.d ?? null;
    case 'rect': {
      const x = length(el, 'x', vw, ctx, style);
      const y = length(el, 'y', vh, ctx, style);
      const w = length(el, 'width', vw, ctx, style);
      const h = length(el, 'height', vh, ctx, style);
      if (!(w > 0 && h > 0)) return null;
      let rx = el.attrs.rx === undefined ? null : length(el, 'rx', vw, ctx, style);
      let ry = el.attrs.ry === undefined ? null : length(el, 'ry', vh, ctx, style);
      rx = Math.min(w / 2, Math.max(0, rx ?? ry ?? 0));
      ry = Math.min(h / 2, Math.max(0, ry ?? rx));
      if (rx === 0 || ry === 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
    case 'circle':
    case 'ellipse': {
      const cx = length(el, 'cx', vw, ctx, style);
      const cy = length(el, 'cy', vh, ctx, style);
      const circle = localName(el.name) === 'circle';
      const rx = circle ? length(el, 'r', Math.hypot(vw, vh) / Math.SQRT2, ctx, style) : length(el, 'rx', vw, ctx, style);
      const ry = circle ? rx : length(el, 'ry', vh, ctx, style);
      if (!(rx > 0 && ry > 0)) return null;
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}Z`;
    }
    case 'line':
      return `M${length(el, 'x1', vw, ctx, style)} ${length(el, 'y1', vh, ctx, style)}L${length(el, 'x2', vw, ctx, style)} ${length(el, 'y2', vh, ctx, style)}`;
    case 'polyline':
    case 'polygon': {
      const pts = numberList(el.attrs.points);
      if (pts.length < 4) return null;
      const pairs = pts.length - (pts.length % 2);
      let d = `M${pts[0]} ${pts[1]}`;
      for (let i = 2; i < pairs; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
      return localName(el.name) === 'polygon' ? `${d}Z` : d;
    }
    default:
      return null;
  }
}

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

function applyToAnchor(m: Matrix, a: Anchor): Anchor {
  const at = (p: { x: number; y: number }) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
  return { ...a, p: at(a.p), in: a.in ? at(a.in) : null, out: a.out ? at(a.out) : null };
}

/** The geometry of a shape element as a node (live rectangle and ellipse when they are plain). */
function geometryNode(el: XmlElement, ctx: Context, style: Style, attrTransform: Matrix): Node | null {
  const tag = localName(el.name);
  const { w: vw, h: vh } = ctx.viewport;
  if (tag === 'rect' && el.attrs.rx === undefined && el.attrs.ry === undefined) {
    const x = length(el, 'x', vw, ctx, style);
    const y = length(el, 'y', vh, ctx, style);
    const w = length(el, 'width', vw, ctx, style);
    const h = length(el, 'height', vh, ctx, style);
    if (!(w > 0 && h > 0)) return null;
    const node = createRect(ctx.ids, w, h);
    node.transform = multiply(attrTransform, translation(x, y));
    return node;
  }
  if (tag === 'rect') {
    const rx = el.attrs.rx === undefined ? null : length(el, 'rx', vw, ctx, style);
    const ry = el.attrs.ry === undefined ? null : length(el, 'ry', vh, ctx, style);
    const w = length(el, 'width', vw, ctx, style);
    const h = length(el, 'height', vh, ctx, style);
    const same = rx === null || ry === null || rx === ry;
    if (w > 0 && h > 0 && same) {
      const r = Math.min(w, h) / 2;
      const node = createRect(ctx.ids, w, h, Math.min(r, Math.max(0, rx ?? ry ?? 0)));
      node.transform = multiply(attrTransform, translation(length(el, 'x', vw, ctx, style), length(el, 'y', vh, ctx, style)));
      return node;
    }
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const circle = tag === 'circle';
    const rx = circle ? length(el, 'r', Math.hypot(vw, vh) / Math.SQRT2, ctx, style) : length(el, 'rx', vw, ctx, style);
    const ry = circle ? rx : length(el, 'ry', vh, ctx, style);
    if (!(rx > 0 && ry > 0)) return null;
    const node = createEllipse(ctx.ids, 2 * rx, 2 * ry);
    node.transform = multiply(attrTransform, translation(length(el, 'cx', vw, ctx, style) - rx, length(el, 'cy', vh, ctx, style) - ry));
    return node;
  }
  const data = shapeData(el, ctx, style);
  if (data === null) return null;
  const { contours, error } = parsePathData(data);
  if (error) warn(ctx, 'path', el.attrs.id ?? tag);
  if (contours.length === 0) return null;
  let node: Node;
  if (contours.length === 1) {
    const c = contours[0] as PathContour;
    node = createPath(ctx.ids, c.anchors, c.closed);
  } else {
    node = createCompound(
      ctx.ids,
      contours.map((c) => createPath(ctx.ids, c.anchors, c.closed)),
      style.fillRule,
    );
  }
  node.transform = [...attrTransform];
  return node;
}

// ── Clipping ────────────────────────────────────────────────────────────────────

/** The clip path as one compound path in the user space of the element it clips; null if it cannot be read. */
function clipMask(id: string, ctx: Context, style: Style): Node | null {
  const el = ctx.byId.get(id);
  if (!el || localName(el.name) !== 'clipPath') {
    warn(ctx, 'clip', id);
    return null;
  }
  if (el.attrs.clipPathUnits === 'objectBoundingBox') {
    warn(ctx, 'clip', 'objectBoundingBox');
    return null;
  }
  const own = parseTransform(el.attrs.transform) ?? IDENTITY;
  const children: ReturnType<typeof createPath>[] = [];
  for (const child of elementsOf(el)) {
    if (!SHAPES.has(localName(child.name))) continue;
    const data = shapeData(child, ctx, style);
    const t = multiply(own, parseTransform(child.attrs.transform) ?? IDENTITY);
    if (data === null) continue;
    for (const c of parsePathData(data).contours) children.push(createPath(ctx.ids, c.anchors.map((a) => applyToAnchor(t, a)), c.closed));
  }
  if (children.length === 0) return null;
  const rule = elementsOf(el).some((c) => c.attrs['clip-rule'] === 'evenodd') ? 'evenodd' : 'nonzero';
  return createCompound(ctx.ids, children, rule);
}

// ── Elements ────────────────────────────────────────────────────────────────────

const SKIPPED = new Set(['defs', 'symbol', 'clippath', 'mask', 'lineargradient', 'radialgradient', 'pattern', 'style', 'title', 'desc', 'metadata', 'marker', 'script', 'filter', 'font', 'namedview', 'foreignobject']);

function blendOf(value: string | undefined): BlendMode {
  return value === 'multiply' || value === 'screen' || value === 'overlay' || value === 'darken' || value === 'lighten' ? value : 'normal';
}

function textNode(el: XmlElement, style: Style, ctx: Context, transform: Matrix): Node | null {
  const { w: vw, h: vh } = ctx.viewport;
  const x = toUserUnits(el.attrs.x?.split(/[\s,]+/)[0], vw, style.fontSize) ?? 0;
  const y = toUserUnits(el.attrs.y?.split(/[\s,]+/)[0], vh, style.fontSize) ?? 0;
  const runs: TextRun[] = [];
  const styleOf = (s: Style): TextStyle => ({
    fontFamily: (s.fontFamily.split(',')[0] ?? 'sans-serif').trim().replace(/^['"]|['"]$/g, ''),
    fontStyle: s.bold && s.italic ? 'Bold Italic' : s.bold ? 'Bold' : s.italic ? 'Italic' : 'Regular',
    size: s.fontSize,
  });
  let first = true;
  const walk = (node: XmlElement, s: Style) => {
    for (const child of node.children) {
      if (typeof child === 'string') {
        const text = child.replace(/\s+/g, ' ');
        if (text.trim().length > 0 || (runs.length > 0 && text.length > 0)) runs.push({ text: first ? text.replace(/^ /, '') : text, style: styleOf(s) });
        if (text.trim().length > 0) first = false;
        continue;
      }
      const tag = localName(child.name);
      if (tag === 'textPath') {
        warn(ctx, 'text-path');
        continue;
      }
      if (tag !== 'tspan') continue;
      if ((child.attrs.x !== undefined || child.attrs.y !== undefined) && runs.length > 0) runs.push({ text: '\n', style: styleOf(s) });
      walk(child, computeStyle(s, declaredStyle(child, ctx), ctx));
    }
  };
  walk(el, style);
  const last = runs[runs.length - 1];
  if (last) last.text = last.text.replace(/ $/, '');
  if (runs.every((r) => r.text.trim().length === 0)) return null;
  const node = createText(ctx.ids, { kind: 'point' }, runs);
  node.transform = multiply(transform, translation(x, y));
  if (style.textAnchor !== 'start') {
    const align: ParagraphStyle['align'] = style.textAnchor === 'middle' ? 'center' : 'right';
    node.paragraphs = [{ align }];
  }
  return node;
}

function imageNode(el: XmlElement, style: Style, ctx: Context, transform: Matrix): Node | null {
  const href = el.attrs['xlink:href'] ?? el.attrs.href ?? '';
  const data = /^data:([^;,]*)(;base64)?,([\s\S]*)$/i.exec(href);
  if (!data) {
    warn(ctx, 'external-image', href.slice(0, 60));
    return null;
  }
  if (/svg/i.test(data[1] ?? '')) {
    warn(ctx, 'svg-image');
    return null;
  }
  const bytes = data[2] ? fromBase64(data[3] as string) : null;
  const info = bytes ? sniffImage(bytes) : null;
  if (!bytes || !info) {
    warn(ctx, 'external-image', 'damaged');
    return null;
  }
  const hash = hashBytes(bytes);
  if (!ctx.images[hash]) ctx.images[hash] = { resource: { width: info.width, height: info.height, format: info.format }, bytes };
  const { w: vw, h: vh } = ctx.viewport;
  const x = length(el, 'x', vw, ctx, style);
  const y = length(el, 'y', vh, ctx, style);
  let w = length(el, 'width', vw, ctx, style);
  let h = length(el, 'height', vh, ctx, style);
  if (!(w > 0 && h > 0)) {
    w = info.width;
    h = info.height;
  }
  // preserveAspectRatio "xMidYMid meet" (the default): the picture keeps its shape inside the box.
  const keep = !/none/.test(el.attrs.preserveAspectRatio ?? '');
  let fw = w;
  let fh = h;
  if (keep) {
    const s = Math.min(w / info.width, h / info.height);
    fw = info.width * s;
    fh = info.height * s;
  }
  return createImage(ctx.ids, hash, fw, fh, multiply(transform, translation(x + (w - fw) / 2, y + (h - fh) / 2)));
}

function convert(el: XmlElement, parentStyle: Style, ctx: Context): Node[] {
  if (++ctx.elements > MAX_ELEMENTS) throw new SvgImportError('The SVG has too many elements');
  const tag = localName(el.name);
  const lower = tag.toLowerCase();
  if (SKIPPED.has(lower)) {
    if (lower === 'filter' || lower === 'mask') warn(ctx, lower);
    return [];
  }
  const declared = declaredStyle(el, ctx);
  if (declared.display === 'none') return [];
  const style = computeStyle(parentStyle, declared, ctx);
  const attrTransform = parseTransform(el.attrs.transform) ?? IDENTITY;
  const opacity = declared.opacity === undefined ? 1 : Math.min(1, Math.max(0, (declared.opacity.endsWith('%') ? Number.parseFloat(declared.opacity) / 100 : Number.parseFloat(declared.opacity)) || 0));
  const blend = blendOf(declared['mix-blend-mode']);
  const clipId = declared['clip-path'] ? urlOf(declared['clip-path']) : null;
  if (declared.mask) warn(ctx, 'mask');
  if (declared.filter ?? el.attrs.filter) warn(ctx, 'filter');

  /** No clip: the object takes the element's opacity and blend. With one, see `clipWrap`. */
  const wrap = (node: Node): Node[] => {
    if (clipId) return clipWrap(node, attrTransform, clipId, style, opacity, blend, ctx);
    node.opacity = opacity;
    node.blendMode = blend;
    return [node];
  };

  if (SHAPES.has(tag)) {
    // With a clip path the shape's own transform belongs to the clip group, so the shape is built in the user space.
    const node = geometryNode(el, ctx, style, clipId ? IDENTITY : attrTransform);
    if (!node) return [];
    node.appearance = appearanceOf(style, geometryBoundsOf(node), ctx);
    if (node.appearance.items.length === 0) return [];
    return wrap(node);
  }

  switch (tag) {
    case 'g':
    case 'a':
    case 'switch': {
      const kids = tag === 'switch' ? elementsOf(el).slice(0, 1) : elementsOf(el);
      const children = kids.flatMap((k) => convert(k, style, ctx));
      if (children.length === 0) return [];
      const group = createGroup(ctx.ids, children);
      group.transform = clipId ? [...IDENTITY] : [...attrTransform];
      return wrap(group);
    }
    case 'svg': {
      const children = elementsOf(el).flatMap((k) => convert(k, style, ctx));
      if (children.length === 0) return [];
      const group = createGroup(ctx.ids, children);
      const x = length(el, 'x', ctx.viewport.w, ctx, style);
      const y = length(el, 'y', ctx.viewport.h, ctx, style);
      group.transform = multiply(attrTransform, translation(x, y));
      group.opacity = opacity;
      group.blendMode = blend;
      return [group];
    }
    case 'use': {
      const ref = (el.attrs['xlink:href'] ?? el.attrs.href ?? '').replace(/^#/, '');
      const target = ctx.byId.get(ref);
      if (!target || ctx.useStack.includes(ref) || ctx.useStack.length >= MAX_USE_DEPTH) {
        warn(ctx, 'use', ref);
        return [];
      }
      ctx.useStack.push(ref);
      const children = convert(target, style, ctx);
      ctx.useStack.pop();
      if (children.length === 0) return [];
      const group = createGroup(ctx.ids, children);
      const offset = translation(length(el, 'x', ctx.viewport.w, ctx, style), length(el, 'y', ctx.viewport.h, ctx, style));
      group.transform = multiply(clipId ? IDENTITY : attrTransform, offset);
      return wrap(group);
    }
    case 'image': {
      const node = imageNode(el, style, ctx, clipId ? IDENTITY : attrTransform);
      if (!node) return [];
      return wrap(node);
    }
    case 'text': {
      const node = textNode(el, style, ctx, clipId ? IDENTITY : attrTransform);
      if (!node) return [];
      const items = appearanceOf(style, null, ctx).items.filter((i) => i.kind === 'fill');
      if (items.length > 0) node.appearance = { items };
      return wrap(node);
    }
    default:
      if (!/^(tspan|stop|textpath)$/.test(lower)) warn(ctx, 'element', tag);
      return [];
  }
}

/**
 * A clipped element: the clip path lives in the element's user space, so a clip group takes the element's transform,
 * opacity and blend, and holds [mask, element] with the element built in that space.
 */
function clipWrap(node: Node, attrTransform: Matrix, clipId: string, style: Style, opacity: number, blend: BlendMode, ctx: Context): Node[] {
  const mask = clipMask(clipId, ctx, style);
  if (!mask) {
    node.transform = multiply(attrTransform, node.transform);
    node.opacity = opacity;
    node.blendMode = blend;
    return [node];
  }
  const clip = createClipGroup(ctx.ids, [mask, node]);
  clip.transform = [...attrTransform];
  clip.opacity = opacity;
  clip.blendMode = blend;
  return [clip];
}

function geometryBoundsOf(node: Node): Rect | null {
  const geometry = nodeGeometry(node);
  return geometry ? geometryBounds(geometry) : null;
}

// ── Entry point ─────────────────────────────────────────────────────────────────

/** Size of the artboard and the matrix that takes SVG user units onto it (1 unit = 1 pt for px and unitless sizes). */
function rootGeometry(root: XmlElement): { width: number; height: number; matrix: Matrix; viewport: { w: number; h: number } } {
  const vb = numberList(root.attrs.viewBox);
  const box = vb.length === 4 && (vb[2] as number) > 0 && (vb[3] as number) > 0 ? { x: vb[0] as number, y: vb[1] as number, w: vb[2] as number, h: vb[3] as number } : null;
  const wl = splitLength(root.attrs.width);
  const hl = splitLength(root.attrs.height);
  const toPt = (l: ReturnType<typeof splitLength>, fallback: number): number => {
    if (!l || l.unit === '%') return fallback;
    const px = toUserUnits(`${l.value}${l.unit}`, 0) ?? fallback;
    return isPhysicalUnit(l.unit) ? px * 0.75 : px;
  };
  const width = Math.max(1, toPt(wl, box?.w ?? DEFAULT_SIZE));
  const height = Math.max(1, toPt(hl, box?.h ?? DEFAULT_SIZE));
  if (box) {
    // viewBox onto the artboard, keeping the aspect ratio and centring (xMidYMid meet).
    const s = Math.min(width / box.w, height / box.h);
    const m = multiply(translation((width - box.w * s) / 2, (height - box.h * s) / 2), multiply(scaling(s, s), translation(-box.x, -box.y)));
    return { width, height, matrix: m, viewport: { w: box.w, h: box.h } };
  }
  // Without a viewBox, physical sizes (mm, cm, in) make a user unit a CSS pixel = 0.75 pt.
  const physical = (wl && isPhysicalUnit(wl.unit)) || (hl && isPhysicalUnit(hl.unit));
  return { width, height, matrix: physical ? scaling(0.75, 0.75) : [...IDENTITY], viewport: { w: width, h: height } };
}

function indexIds(el: XmlElement, byId: Map<string, XmlElement>, styles: string[]): void {
  if (el.attrs.id && !byId.has(el.attrs.id)) byId.set(el.attrs.id, el);
  if (localName(el.name) === 'style') styles.push(textContent(el));
  for (const child of elementsOf(el)) indexIds(child, byId, styles);
}

/** Reads an SVG file (text or bytes). Throws SvgImportError when it is not an SVG document. */
export function importSvg(source: string | Uint8Array, ids: IdGenerator): SvgImport {
  const text = typeof source === 'string' ? source : strFromU8(source);
  let root: XmlElement;
  try {
    root = parseXml(text);
  } catch (error) {
    throw new SvgImportError(error instanceof XmlError ? error.message : 'The file is not valid XML');
  }
  if (localName(root.name) !== 'svg') throw new SvgImportError('The file is not an SVG document');

  const byId = new Map<string, XmlElement>();
  const styles: string[] = [];
  indexIds(root, byId, styles);
  const rules: CssRule[] = [];
  const warnings: SvgWarning[] = [];
  for (const css of styles) {
    const parsed = parseStylesheet(css);
    rules.push(...parsed.rules);
    if (parsed.skipped > 0) warnings.push({ code: 'selector', detail: String(parsed.skipped) });
  }
  const { width, height, matrix, viewport } = rootGeometry(root);
  const ctx: Context = { ids, rules, byId, warnings, gradients: [], gradientCache: new Map(), images: {}, viewport, elements: 0, useStack: [] };

  const rootStyle = computeStyle(ROOT_STYLE, declaredStyle(root, ctx), ctx);
  const rootTransform = parseTransform(root.attrs.transform);
  const full = rootTransform ? multiply(matrix, rootTransform) : matrix;
  const nodes = elementsOf(root).flatMap((child) => convert(child, rootStyle, ctx));
  if (full.some((v, i) => v !== IDENTITY[i])) for (const node of nodes) node.transform = multiply(full, node.transform);
  if (nodes.length === 0) warnings.push({ code: 'size', detail: 'empty' });
  return { width, height, nodes, gradients: ctx.gradients, images: ctx.images, warnings };
}

import { createImage } from '../../commands/image';
import { sniffImage } from '../imageInfo';
import { hashBytes } from '../imageStore';
import { createClipGroup, createCompound, createPath, createText, defaultStroke } from '../../model/factory';
import type { IdGenerator } from '../../model/ids';
import { IDENTITY, determinant, multiply, scaling } from '../../model/matrix';
import type { Anchor, Appearance, AppearanceItem, BlendMode, Gradient, ImageResource, Matrix, Node, Paint, StrokeStyle, TextNode, Vec2 } from '../../model/types';
import { anchorKind } from '../svg/pathData';

// PDF import (specs/02 · Importar / exportar), vector part. It does not depend on pdf.js: the caller hands over what
// pdf.js produced for a page (the operator list, the objects it refers to, the text) and the table of its operator
// numbers, and gets objects back. Paths become paths and compound paths, with fills and strokes; clipping becomes clipping
// groups; axial and radial shadings become gradients; pictures and text are converted when the caller can supply them.

export interface PdfPageData {
  /** Size of the page in pt, as the viewport shows it (rotation applied). */
  width: number;
  height: number;
  /** PDF user space → page as drawn (y down): `page.getViewport({ scale: 1 }).transform`. */
  viewTransform: Matrix;
  fnArray: ArrayLike<number>;
  argsArray: ReadonlyArray<ArrayLike<unknown> | null>;
}

export interface PdfTextItem {
  str: string;
  /** Text space → PDF user space (includes the font size). */
  transform: Matrix;
  fontFamily?: string;
}

export interface PdfHost {
  /** pdf.js `OPS`: operator names to numbers. */
  ops: Readonly<Record<string, number>>;
  /** What the page asks for by name: `RadialAxial` shading patterns. */
  getObject(id: string): Promise<unknown>;
  /** A picture of the page as a PNG or JPEG file, or null when it cannot be had. */
  getImage(id: string): Promise<{ bytes: Uint8Array } | null>;
  /** Text of the page, when the caller wants it as editable text. */
  text?: readonly PdfTextItem[];
}

export interface PdfWarning {
  code: 'pattern' | 'shading' | 'soft-mask' | 'image-mask' | 'image' | 'text' | 'operator';
  detail?: string;
}

export interface PdfPageImport {
  width: number;
  height: number;
  nodes: Node[];
  gradients: Gradient[];
  images: Record<string, { resource: ImageResource; bytes: Uint8Array }>;
  warnings: PdfWarning[];
}

const MAX_NODES = 300_000;
const BLEND: Record<string, BlendMode> = { Multiply: 'multiply', Screen: 'screen', Overlay: 'overlay', Darken: 'darken', Lighten: 'lighten' };

interface GState {
  ctm: Matrix;
  fill: Paint | null;
  stroke: Paint | null;
  fillAlpha: number;
  strokeAlpha: number;
  lineWidth: number;
  cap: StrokeStyle['cap'];
  join: StrokeStyle['join'];
  miter: number;
  dash: number[] | null;
  blend: BlendMode;
}

interface Frame {
  /** `save` frames hold a graphics state to come back to; `clip` frames are the container of everything a clip covers. */
  kind: 'save' | 'clip';
  saved: GState;
  children: Node[];
  mask?: Node;
}

const hex = (value: unknown): [number, number, number] | null => {
  const m = typeof value === 'string' ? /^#([0-9a-f]{6})$/i.exec(value) : null;
  if (!m) return null;
  const n = Number.parseInt(m[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const solid = (rgb: [number, number, number]): Paint => ({ type: 'solid', color: { model: 'rgb', values: [...rgb] } });
const at = (m: Matrix, x: number, y: number): Vec2 => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** One contour of a path in page coordinates. */
interface Contour {
  anchors: Anchor[];
  closed: boolean;
}

/** Reads pdf.js's compact path (`moveTo 0, lineTo 1, curveTo 2, quadraticCurveTo 3, closePath 4`), moving every point through `m`. */
function readPath(data: ArrayLike<number>, m: Matrix): Contour[] {
  const contours: Contour[] = [];
  let current: Contour | null = null;
  let pos: Vec2 = { x: 0, y: 0 };
  const point = (i: number): Vec2 => at(m, num(data[i]), num(data[i + 1]));
  const open = (p: Vec2) => {
    current = { anchors: [{ p, in: null, out: null, kind: 'corner' }], closed: false };
    contours.push(current);
    pos = p;
  };
  const ensure = (): Contour => {
    if (!current || current.closed) open(pos);
    return current as unknown as Contour;
  };
  let i = 0;
  while (i < data.length) {
    const op = data[i++];
    if (op === 0) {
      open(point(i));
      i += 2;
    } else if (op === 1) {
      const p = point(i);
      ensure().anchors.push({ p, in: null, out: null, kind: 'corner' });
      pos = p;
      i += 2;
    } else if (op === 2) {
      const c = ensure();
      const prev = c.anchors[c.anchors.length - 1] as Anchor;
      prev.out = point(i);
      const p = point(i + 4);
      c.anchors.push({ p, in: point(i + 2), out: null, kind: 'corner' });
      pos = p;
      i += 6;
    } else if (op === 3) {
      const c = ensure();
      const prev = c.anchors[c.anchors.length - 1] as Anchor;
      const q = point(i);
      const p = point(i + 2);
      prev.out = { x: prev.p.x + (2 / 3) * (q.x - prev.p.x), y: prev.p.y + (2 / 3) * (q.y - prev.p.y) };
      c.anchors.push({ p, in: { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) }, out: null, kind: 'corner' });
      pos = p;
      i += 4;
    } else if (op === 4) {
      const c = current as Contour | null;
      if (c && !c.closed) {
        c.closed = true;
        pos = (c.anchors[0] as Anchor).p;
      }
    } else {
      break; // unknown opcode: stop rather than misread the rest
    }
  }
  for (const c of contours) {
    if (c.closed && c.anchors.length > 1) {
      const first = c.anchors[0] as Anchor;
      const last = c.anchors[c.anchors.length - 1] as Anchor;
      if (Math.abs(first.p.x - last.p.x) < 1e-6 && Math.abs(first.p.y - last.p.y) < 1e-6) {
        first.in = last.in;
        c.anchors.pop();
      }
    }
    for (const a of c.anchors) a.kind = anchorKind(a);
  }
  return contours.filter((c) => c.anchors.length > 1);
}

function pathNode(contours: Contour[], rule: 'nonzero' | 'evenodd', ids: IdGenerator): Node | null {
  if (contours.length === 0) return null;
  if (contours.length === 1) {
    const c = contours[0] as Contour;
    return createPath(ids, c.anchors, c.closed);
  }
  return createCompound(
    ids,
    contours.map((c) => createPath(ids, c.anchors, c.closed)),
    rule,
  );
}

/** Converts one page. Never throws for something it does not understand: that is a warning. */
export async function importPdfPage(page: PdfPageData, host: PdfHost, ids: IdGenerator): Promise<PdfPageImport> {
  const { ops } = host;
  const warnings: PdfWarning[] = [];
  const warn = (code: PdfWarning['code'], detail?: string) => {
    if (!warnings.some((w) => w.code === code && w.detail === detail)) warnings.push(detail === undefined ? { code } : { code, detail });
  };
  const gradients: Gradient[] = [];
  const images: PdfPageImport['images'] = {};
  const patterns = new Map<string, { gradient: Gradient; axis: Matrix } | null>();

  // pdf.js does not put the viewport in the list: user space starts as the page is shown (y down).
  const initial: GState = { ctm: [...page.viewTransform], fill: solid([0, 0, 0]), stroke: solid([0, 0, 0]), fillAlpha: 1, strokeAlpha: 1, lineWidth: 1, cap: 'butt', join: 'miter', miter: 10, dash: null, blend: 'normal' };
  let state: GState = { ...initial };
  const root: Frame = { kind: 'save', saved: state, children: [] };
  const frames: Frame[] = [root];
  const top = () => frames[frames.length - 1] as Frame;
  let nodes = 0;
  let pendingClip: 'nonzero' | 'evenodd' | null = null;

  const add = (node: Node | null) => {
    if (node && nodes++ < MAX_NODES) top().children.push(node);
  };

  const close = (frame: Frame): Node[] => {
    if (frame.kind === 'clip' && frame.mask) {
      if (frame.children.length === 0) return [];
      return [createClipGroup(ids, [frame.mask, ...frame.children])];
    }
    return frame.children;
  };
  const restore = () => {
    // Everything above the nearest save frame (clips opened since) closes into its parent.
    while (frames.length > 1) {
      const frame = frames.pop() as Frame;
      top().children.push(...close(frame));
      if (frame.kind === 'save') {
        state = frame.saved;
        return;
      }
    }
  };

  const scale = () => Math.sqrt(Math.abs(determinant(state.ctm))) || 1;

  async function patternPaint(name: string, pattern: Matrix): Promise<Paint | null> {
    let entry = patterns.get(name);
    if (entry === undefined) {
      entry = null;
      const ir = (await host.getObject(name).catch(() => null)) as unknown[] | null;
      if (Array.isArray(ir) && ir[0] === 'RadialAxial' && Array.isArray(ir[3])) {
        const stops = (ir[3] as Array<[number, string]>).map(([offset, color]) => ({ offset: Math.min(1, Math.max(0, num(offset))), color: { model: 'rgb' as const, values: [...(hex(color) ?? [0, 0, 0])] }, opacity: 1 }));
        const [x0, y0] = (ir[4] as number[] | undefined) ?? [0, 0];
        const [x1, y1] = (ir[5] as number[] | undefined) ?? [1, 0];
        if (stops.length > 0) {
          const gradient: Gradient = { id: ids(), name, type: ir[1] === 'radial' ? 'radial' : 'linear', stops };
          let axis: Matrix;
          if (ir[1] === 'radial') {
            const r0 = num(ir[6]);
            const r1 = num(ir[7]);
            if (r0 > 1e-6 || Math.abs(num(x0) - num(x1)) > 1e-6 || Math.abs(num(y0) - num(y1)) > 1e-6) warn('shading', 'radial');
            axis = [r1, 0, 0, r1, num(x1), num(y1)];
          } else {
            const dx = num(x1) - num(x0);
            const dy = num(y1) - num(y0);
            axis = [dx, dy, -dy, dx, num(x0), num(y0)];
          }
          entry = { gradient, axis };
          if (stops.length > 1) gradients.push(gradient);
        }
      } else {
        warn('pattern', name);
      }
      patterns.set(name, entry);
    }
    if (!entry) return null;
    const only = entry.gradient.stops.length === 1 ? entry.gradient.stops[0] : undefined;
    if (only) return { type: 'solid', color: only.color };
    // Shading space → PDF user space (`pattern`) → page as drawn. The objects are already in page coordinates, so no more.
    return { type: entry.gradient.type, gradientId: entry.gradient.id, transform: multiply(page.viewTransform, multiply(pattern, entry.axis)) };
  }

  const appearance = (fill: boolean, stroke: boolean): Appearance => {
    const items: AppearanceItem[] = [];
    if (fill && state.fill) items.push({ kind: 'fill', paint: state.fill, opacity: state.fillAlpha, modifiers: [] });
    if (stroke && state.stroke) {
      const s = scale();
      const style: StrokeStyle = { ...defaultStroke(), width: Math.max(0.25, state.lineWidth * s), cap: state.cap, join: state.join, miterLimit: state.miter, dash: state.dash ? state.dash.map((d) => d * s) : null };
      items.push({ kind: 'stroke', paint: state.stroke, stroke: style, opacity: state.strokeAlpha, modifiers: [] });
    }
    return { items };
  };

  const paintPath = (data: ArrayLike<number>, op: number, closeIt: boolean): void => {
    const contours = readPath(data, state.ctm);
    if (closeIt) for (const c of contours) c.closed = true;
    const evenOdd = op === ops.eoFill || op === ops.eoFillStroke || op === ops.closeEOFillStroke;
    const fill = op === ops.fill || op === ops.eoFill || op === ops.fillStroke || op === ops.eoFillStroke || op === ops.closeFillStroke || op === ops.closeEOFillStroke;
    const stroke = op === ops.stroke || op === ops.closeStroke || op === ops.fillStroke || op === ops.eoFillStroke || op === ops.closeFillStroke || op === ops.closeEOFillStroke;
    if (op === ops.endPath) {
      if (pendingClip) {
        const mask = pathNode(contours, pendingClip, ids);
        if (mask) frames.push({ kind: 'clip', saved: state, children: [], mask });
        pendingClip = null;
      }
      return;
    }
    if (!fill && !stroke) return;
    const node = pathNode(contours, evenOdd ? 'evenodd' : 'nonzero', ids);
    if (!node) return;
    node.appearance = appearance(fill, stroke);
    node.blendMode = state.blend;
    if (node.appearance.items.length > 0) add(node);
    if (pendingClip) {
      const mask = pathNode(readPath(data, state.ctm), pendingClip, ids);
      if (mask) frames.push({ kind: 'clip', saved: state, children: [], mask });
      pendingClip = null;
    }
  };

  for (let i = 0; i < page.fnArray.length; i++) {
    const fn = page.fnArray[i] as number;
    const args = page.argsArray[i] ?? [];
    switch (fn) {
      case ops.save:
        frames.push({ kind: 'save', saved: state, children: [] });
        state = { ...state };
        break;
      case ops.restore:
        restore();
        break;
      case ops.transform:
        state = { ...state, ctm: multiply(state.ctm, args as unknown as Matrix) };
        break;
      case ops.setLineWidth:
        state.lineWidth = num(args[0], 1);
        break;
      case ops.setLineCap:
        state.cap = args[0] === 1 ? 'round' : args[0] === 2 ? 'square' : 'butt';
        break;
      case ops.setLineJoin:
        state.join = args[0] === 1 ? 'round' : args[0] === 2 ? 'bevel' : 'miter';
        break;
      case ops.setMiterLimit:
        state.miter = Math.max(1, num(args[0], 10));
        break;
      case ops.setDash: {
        const list = Array.isArray(args[0]) ? (args[0] as number[]).filter((n) => Number.isFinite(n) && n >= 0) : [];
        state.dash = list.length > 0 && list.some((n) => n > 0) ? (list.length % 2 === 1 ? [...list, ...list] : list) : null;
        break;
      }
      case ops.setGState: {
        for (const entry of (args[0] as Array<[string, unknown]> | undefined) ?? []) {
          const [key, value] = entry;
          if (key === 'ca') state.fillAlpha = Math.min(1, Math.max(0, num(value, 1)));
          else if (key === 'CA') state.strokeAlpha = Math.min(1, Math.max(0, num(value, 1)));
          else if (key === 'LW') state.lineWidth = num(value, 1);
          else if (key === 'LC') state.cap = value === 1 ? 'round' : value === 2 ? 'square' : 'butt';
          else if (key === 'LJ') state.join = value === 1 ? 'round' : value === 2 ? 'bevel' : 'miter';
          else if (key === 'ML') state.miter = Math.max(1, num(value, 10));
          else if (key === 'BM') state.blend = BLEND[Array.isArray(value) ? String(value[0]) : String(value)] ?? 'normal';
          else if (key === 'SMask' && value && value !== 'None') warn('soft-mask');
        }
        break;
      }
      case ops.setFillRGBColor: {
        const rgb = hex(args[0]);
        if (rgb) state.fill = solid(rgb);
        break;
      }
      case ops.setStrokeRGBColor: {
        const rgb = hex(args[0]);
        if (rgb) state.stroke = solid(rgb);
        break;
      }
      case ops.setFillTransparent:
        state.fill = null;
        break;
      case ops.setStrokeTransparent:
        state.stroke = null;
        break;
      case ops.setFillColorN:
      case ops.setStrokeColorN: {
        const kind = fn === ops.setFillColorN ? 'fill' : 'stroke';
        let paint: Paint | null = null;
        if (args[0] === 'Shading') paint = await patternPaint(String(args[1]), (args[2] as Matrix | undefined) ?? [...IDENTITY]);
        else warn('pattern', String(args[0]));
        state[kind] = paint ?? state[kind];
        break;
      }
      case ops.clip:
        pendingClip = 'nonzero';
        break;
      case ops.eoClip:
        pendingClip = 'evenodd';
        break;
      case ops.constructPath: {
        const op = num(args[0], -1);
        const data = ((args[1] as ArrayLike<unknown> | undefined)?.[0] ?? []) as ArrayLike<number>;
        paintPath(data, op, op === ops.closeStroke || op === ops.closeFillStroke || op === ops.closeEOFillStroke);
        break;
      }
      case ops.paintFormXObjectBegin: {
        frames.push({ kind: 'save', saved: state, children: [] });
        state = { ...state };
        const m = args[0] as Matrix | null | undefined;
        if (m) state.ctm = multiply(state.ctm, m);
        const box = args[1] as number[] | null | undefined;
        if (box && box.length === 4) {
          const [x0, y0, x1, y1] = box as [number, number, number, number];
          const mask = pathNode(readPath([0, x0, y0, 1, x1, y0, 1, x1, y1, 1, x0, y1, 4], state.ctm), 'nonzero', ids);
          if (mask) frames.push({ kind: 'clip', saved: state, children: [], mask });
        }
        break;
      }
      case ops.paintFormXObjectEnd:
        restore();
        break;
      case ops.paintImageXObject:
      case ops.paintInlineImageXObject: {
        const id = typeof args[0] === 'string' ? args[0] : null;
        const file = id ? await host.getImage(id).catch(() => null) : null;
        const info = file ? sniffImage(file.bytes) : null;
        if (!file || !info) {
          warn('image');
          break;
        }
        const hash = hashBytes(file.bytes);
        if (!images[hash]) images[hash] = { resource: { width: info.width, height: info.height, format: info.format }, bytes: file.bytes };
        // The picture fills the unit square of user space with its first row on top: pixels (y down) → unit square (y up).
        const node = createImage(ids, hash, info.width, info.height, multiply(state.ctm, [1 / info.width, 0, 0, -1 / info.height, 0, 1]));
        node.opacity = state.fillAlpha;
        node.blendMode = state.blend;
        add(node);
        break;
      }
      case ops.paintImageMaskXObject:
      case ops.paintInlineImageMaskXObject:
        warn('image-mask');
        break;
      case ops.shadingFill:
        warn('shading', 'sh');
        break;
      default:
        break;
    }
  }
  while (frames.length > 1) {
    const frame = frames.pop() as Frame;
    top().children.push(...close(frame));
  }

  const out = root.children;
  if (host.text && host.text.length > 0) {
    warn('text');
    for (const item of host.text) {
      if (item.str.trim().length === 0) continue;
      const [a, b, c, d, e, f] = item.transform;
      const size = Math.hypot(a, b) || 1;
      const node: TextNode = createText(ids, { kind: 'point' }, [{ text: item.str, style: { fontFamily: (item.fontFamily ?? 'sans-serif').split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') || 'sans-serif', fontStyle: 'Regular', size } }]);
      // Text space is y up and ours y down: mirror once, and take the font size out of the matrix (it is the text size).
      const upright = multiply(page.viewTransform, multiply([a / size, b / size, c / size, d / size, e, f], scaling(1, -1)));
      node.transform = upright;
      out.push(node);
    }
  }
  return { width: page.width, height: page.height, nodes: out, gradients, images, warnings };
}

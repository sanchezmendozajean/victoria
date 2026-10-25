import { PDFDict, PDFDocument, PDFName, type PDFContext, type PDFRef } from 'pdf-lib';
import type { ImageStore } from '../io/imageStore';
import { IDENTITY, multiply } from '../model/matrix';
import type { ImageResource, Matrix, Vec2 } from '../model/types';
import { segmentIsStraight, outsideClipPath, type Scene, type SceneOp, type ScenePaint, type ScenePath, type SceneStop } from './scene';
import type { ExportWarning } from './svg';

export interface PdfOptions {
  /** Format of each image resource (PNG and JPEG embed as they are; WebP is not supported by PDF and is skipped). */
  imageFormats?: Record<string, ImageResource['format']>;
}

const n = (v: number): string => {
  const text = (Math.round(v * 10000) / 10000).toString();
  return text === '-0' ? '0' : text;
};

const BLEND_PDF: Record<string, string> = { multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', darken: 'Darken', lighten: 'Lighten' };
const CAP = { butt: 0, round: 1, square: 2 } as const;
const JOIN = { miter: 0, round: 1, bevel: 2 } as const;

/** Moves `p` through `m` (used to write a clip path in its own coordinates without changing the matrix). */
const through = (m: Matrix | null, p: Vec2): Vec2 => (m ? { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] } : p);

function pathOps(path: ScenePath, m: Matrix | null = null): string {
  const out: string[] = [];
  for (const contour of path.contours) {
    const first = contour.segments[0];
    if (!first) continue;
    const start = through(m, first.p0);
    out.push(`${n(start.x)} ${n(start.y)} m`);
    const last = contour.segments[contour.segments.length - 1];
    for (const seg of contour.segments) {
      if (contour.closed && seg === last && segmentIsStraight(seg) && seg.p3.x === first.p0.x && seg.p3.y === first.p0.y) continue;
      const p3 = through(m, seg.p3);
      if (segmentIsStraight(seg)) out.push(`${n(p3.x)} ${n(p3.y)} l`);
      else {
        const c1 = through(m, seg.c1);
        const c2 = through(m, seg.c2);
        out.push(`${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(p3.x)} ${n(p3.y)} c`);
      }
    }
    if (contour.closed) out.push('h');
  }
  return out.join('\n');
}

/** A PDF dictionary from a plain object (names are strings, arrays and numbers convert themselves). */
const dict = (ctx: PDFContext, literal: object): PDFDict => ctx.obj(literal as Record<string, never>);

const rgbOps = (rgb: [number, number, number]): string => rgb.map((v) => n(v / 255)).join(' ');

interface PageState {
  doc: PDFDocument;
  page: ReturnType<PDFDocument['addPage']>;
  images: ImageStore;
  formats: Record<string, ImageResource['format']>;
  warnings: ExportWarning[];
  gs: Map<string, string>;
  xobjects: Map<string, string | null>;
  counter: { gs: number; pattern: number; image: number };
  lines: string[];
}

function extGState(st: PageState, alpha: number, blend: string): string | null {
  if (alpha >= 1 && blend === 'normal') return null;
  const key = `${n(alpha)}|${blend}`;
  const existing = st.gs.get(key);
  if (existing) return existing;
  const name = `GS${++st.counter.gs}`;
  const record: Record<string, unknown> = { Type: 'ExtGState', ca: alpha, CA: alpha };
  if (blend !== 'normal') record.BM = BLEND_PDF[blend] ?? 'Normal';
  st.page.node.setExtGState(PDFName.of(name), dict(st.doc.context, record));
  st.gs.set(key, name);
  return name;
}

function stitched(st: PageState, stops: readonly SceneStop[]): PDFRef | PDFDict {
  const ctx = st.doc.context;
  const padded = [...stops];
  const first = padded[0] as SceneStop;
  const last = padded[padded.length - 1] as SceneStop;
  if (first.offset > 0) padded.unshift({ ...first, offset: 0 });
  if (last.offset < 1) padded.push({ ...last, offset: 1 });
  const functions: PDFRef[] = [];
  const bounds: number[] = [];
  let previous = 0;
  for (let i = 0; i < padded.length - 1; i++) {
    const a = padded[i] as SceneStop;
    const b = padded[i + 1] as SceneStop;
    functions.push(ctx.register(dict(ctx, { FunctionType: 2, Domain: [0, 1], C0: a.rgb.map((v) => v / 255), C1: b.rgb.map((v) => v / 255), N: 1 })));
    if (i < padded.length - 2) {
      // Bounds must increase: a hard stop (two equal offsets) is nudged apart.
      const bound = Math.max(b.offset, previous + 1e-6);
      bounds.push(bound);
      previous = bound;
    }
  }
  if (functions.length === 1) return functions[0] as PDFRef;
  return ctx.register(dict(ctx, { FunctionType: 3, Domain: [0, 1], Functions: functions, Bounds: bounds, Encode: functions.flatMap(() => [0, 1]) }));
}

/** A shading pattern for a gradient paint. Its matrix maps the unit space to the page, so the current matrix is needed. */
function patternFor(st: PageState, paint: Extract<ScenePaint, { kind: 'gradient' }>, ctm: Matrix): string | null {
  if (paint.stops.length === 0) return null;
  if (paint.stops.some((s) => s.alpha < 1)) st.warnings.push({ code: 'gradient-alpha' });
  const ctx = st.doc.context;
  const shading = ctx.register(
    dict(ctx, {
      ShadingType: paint.type === 'linear' ? 2 : 3,
      ColorSpace: 'DeviceRGB',
      Coords: paint.type === 'linear' ? [0, 0, 1, 0] : [0, 0, 0, 0, 0, 1],
      Function: stitched(st, paint.stops),
      Extend: [true, true],
    }),
  );
  const matrix = multiply(ctm, paint.transform);
  const pattern = ctx.register(dict(ctx, { Type: 'Pattern', PatternType: 2, Shading: shading, Matrix: [...matrix] }));
  const name = `P${++st.counter.pattern}`;
  const resources = st.page.node.Resources();
  if (!resources) return null;
  let patterns = resources.lookupMaybe(PDFName.of('Pattern'), PDFDict);
  if (!patterns) {
    patterns = dict(ctx, {});
    resources.set(PDFName.of('Pattern'), patterns);
  }
  patterns.set(PDFName.of(name), pattern);
  return name;
}

interface Carry {
  ctm: Matrix;
  opacity: number;
  blend: string;
}

/** Sets colour and transparency for a fill or stroke; returns false when there is nothing to paint. */
function setPaint(st: PageState, paint: ScenePaint, kind: 'fill' | 'stroke', opacity: number, carry: Carry): boolean {
  const alphaOf = paint.kind === 'solid' ? paint.alpha : 1;
  const alpha = Math.min(1, Math.max(0, alphaOf * opacity * carry.opacity));
  if (alpha <= 0) return false;
  const gs = extGState(st, alpha, carry.blend);
  if (gs) st.lines.push(`/${gs} gs`);
  if (paint.kind === 'solid') {
    st.lines.push(`${rgbOps(paint.rgb)} ${kind === 'fill' ? 'rg' : 'RG'}`);
    return true;
  }
  if (paint.stops.length === 1) {
    const only = paint.stops[0] as SceneStop;
    st.lines.push(`${rgbOps(only.rgb)} ${kind === 'fill' ? 'rg' : 'RG'}`);
    return true;
  }
  const name = patternFor(st, paint, carry.ctm);
  if (!name) return false;
  st.lines.push(kind === 'fill' ? `/Pattern cs /${name} scn` : `/Pattern CS /${name} SCN`);
  return true;
}

function strokeSetup(op: Extract<SceneOp, { kind: 'stroke' }>, width: number): string {
  const dash = op.dash && op.dash.length > 0 ? (op.dash.length % 2 === 1 ? [...op.dash, ...op.dash] : op.dash) : null;
  return [`${n(width)} w`, `${CAP[op.cap]} J`, `${JOIN[op.join]} j`, `${n(op.miterLimit)} M`, dash ? `[${dash.map(n).join(' ')}] 0 d` : '[] 0 d'].join('\n');
}

async function imageName(st: PageState, hash: string): Promise<string | null> {
  if (st.xobjects.has(hash)) return st.xobjects.get(hash) ?? null;
  const bytes = st.images.get(hash);
  const format = st.formats[hash] ?? 'png';
  let name: string | null = null;
  if (!bytes) st.warnings.push({ code: 'image-missing', detail: hash });
  else if (format === 'webp') st.warnings.push({ code: 'image-format', detail: hash });
  else {
    try {
      const image = format === 'jpeg' ? await st.doc.embedJpg(bytes) : await st.doc.embedPng(bytes);
      name = `Im${++st.counter.image}`;
      st.page.node.setXObject(PDFName.of(name), image.ref);
    } catch {
      st.warnings.push({ code: 'image-format', detail: hash });
    }
  }
  st.xobjects.set(hash, name);
  return name;
}

async function writeOp(st: PageState, op: SceneOp, carry: Carry): Promise<void> {
  switch (op.kind) {
    case 'fill': {
      const body = pathOps(op.path);
      if (!body) return;
      st.lines.push('q');
      if (setPaint(st, op.paint, 'fill', op.opacity, carry)) st.lines.push(body, op.path.rule === 'evenodd' ? 'f*' : 'f');
      st.lines.push('Q');
      return;
    }
    case 'stroke': {
      const body = pathOps(op.path);
      if (!body) return;
      st.lines.push('q');
      if (setPaint(st, op.paint, 'stroke', op.opacity, carry)) {
        if (op.align === 'center') {
          st.lines.push(strokeSetup(op, op.width), body, 'S');
        } else {
          // Inside / outside: stroke twice as wide and keep one side with a clip.
          const clip = op.align === 'inside' ? pathOps(op.path) + `\n${op.path.rule === 'evenodd' ? 'W*' : 'W'} n` : pathOps(outsideClipPath(op.path)) + '\nW* n';
          st.lines.push(clip, strokeSetup(op, op.width * 2), body, 'S');
        }
      }
      st.lines.push('Q');
      return;
    }
    case 'image': {
      const name = await imageName(st, op.hash);
      if (!name) return;
      const gs = extGState(st, carry.opacity, carry.blend);
      st.lines.push('q');
      if (gs) st.lines.push(`/${gs} gs`);
      st.lines.push(`${n(op.width)} 0 0 ${n(-op.height)} 0 ${n(op.height)} cm`, `/${name} Do`, 'Q');
      return;
    }
    case 'group': {
      if (op.effect) {
        // PDF has no blur: a shadow or glow is left out (the object itself is still drawn).
        if (!st.warnings.some((w) => w.code === 'effects-unsupported')) st.warnings.push({ code: 'effects-unsupported' });
        return;
      }
      st.lines.push('q');
      if (op.matrix.some((v, i) => v !== IDENTITY[i])) st.lines.push(`${op.matrix.map(n).join(' ')} cm`);
      if (op.clip) st.lines.push(pathOps(op.clip.path, op.clip.matrix), op.clip.path.rule === 'evenodd' ? 'W* n' : 'W n');
      // Group opacity and blend mode reach each shape (as on the canvas) instead of making a transparency group.
      const next: Carry = { ctm: multiply(carry.ctm, op.matrix), opacity: carry.opacity * op.opacity, blend: op.blend !== 'normal' ? op.blend : carry.blend };
      for (const child of op.children) await writeOp(st, child, next);
      st.lines.push('Q');
    }
  }
}

/**
 * Writes one page per scene, as vector graphics: fills, strokes with caps, joins and dashes, clipping,
 * axial and radial gradients (shading patterns), opacity and blend modes (graphics states) and embedded
 * PNG and JPEG images. Shadows and glows, gradient transparency and WebP images are not representable
 * and come back as warnings.
 */
export async function writePdf(scenes: readonly Scene[], images: ImageStore, options: PdfOptions = {}): Promise<{ bytes: Uint8Array; warnings: ExportWarning[] }> {
  const doc = await PDFDocument.create();
  doc.setCreator('Victoria');
  doc.setProducer('Victoria');
  const warnings: ExportWarning[] = [];
  for (const scene of scenes) {
    const page = doc.addPage([scene.width, scene.height]);
    const st: PageState = {
      doc,
      page,
      images,
      formats: options.imageFormats ?? {},
      warnings,
      gs: new Map(),
      xobjects: new Map(),
      counter: { gs: 0, pattern: 0, image: 0 },
      lines: [],
    };
    // PDF has Y up and the scene Y down: flip once at the top of the page.
    const flip: Matrix = [1, 0, 0, -1, 0, scene.height];
    st.lines.push(`${flip.map(n).join(' ')} cm`);
    if (scene.background !== 'transparent') {
      st.lines.push('q', `${rgbOps(scene.background)} rg`, `0 0 ${n(scene.width)} ${n(scene.height)} re f`, 'Q');
    }
    for (const op of scene.ops) await writeOp(st, op, { ctm: flip, opacity: 1, blend: 'normal' });
    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream(st.lines.join('\n'))));
  }
  const bytes = await doc.save({ useObjectStreams: false });
  const unique = new Map<string, ExportWarning>();
  for (const w of warnings) unique.set(`${w.code}:${w.detail ?? ''}`, w);
  return { bytes, warnings: [...unique.values()] };
}

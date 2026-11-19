import type { ImageStore } from '../io/imageStore';
import type { ImageResource, Matrix } from '../model/types';
import { toBase64 } from './base64';
import { outsideClipPath, segmentIsStraight, type RGB, type Scene, type SceneEffect, type SceneOp, type ScenePaint, type ScenePath } from './scene';

export interface ExportWarning {
  code: 'image-missing' | 'image-format' | 'effects-unsupported' | 'gradient-alpha';
  detail?: string;
}

export interface SvgOptions {
  /** Smaller file: no indentation and no line breaks. */
  minify?: boolean;
  /** Format of each image resource, for the data URI. */
  imageFormats?: Record<string, ImageResource['format']>;
  /**
   * 'drawing' (default) writes what is seen: groups without attributes vanish and every shape is a path of curves.
   * 'semantic' keeps the document's structure: a `<g>` per group, `<rect>`, `<circle>` and `<ellipse>` for live shapes,
   * and an object's transform, opacity and blend mode on its own element (specs/02 · Modo SVG).
   */
  structure?: 'drawing' | 'semantic';
}

const MIME: Record<ImageResource['format'], string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

/** Up to 3 decimals, without trailing zeros or "-0". */
export const num = (v: number): string => {
  const text = (Math.round(v * 1000) / 1000).toString();
  return text === '-0' ? '0' : text;
};

const hex = (rgb: RGB): string => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

const matrixAttr = (m: Matrix): string => `matrix(${m.map(num).join(' ')})`;

function pathData(path: ScenePath): string {
  const out: string[] = [];
  for (const contour of path.contours) {
    const first = contour.segments[0];
    if (!first) continue;
    out.push(`M${num(first.p0.x)} ${num(first.p0.y)}`);
    const last = contour.segments[contour.segments.length - 1];
    for (const seg of contour.segments) {
      // The span that returns to the start of a closed contour is what Z already draws.
      if (contour.closed && seg === last && segmentIsStraight(seg) && seg.p3.x === first.p0.x && seg.p3.y === first.p0.y) continue;
      out.push(segmentIsStraight(seg) ? `L${num(seg.p3.x)} ${num(seg.p3.y)}` : `C${num(seg.c1.x)} ${num(seg.c1.y)} ${num(seg.c2.x)} ${num(seg.c2.y)} ${num(seg.p3.x)} ${num(seg.p3.y)}`);
    }
    if (contour.closed) out.push('Z');
  }
  return out.join('');
}

const BLEND_CSS: Record<string, string> = { multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten' };

/**
 * Writes the scene as an SVG document, 1 pt = 1 user unit. Gradients use the paint's unit space with
 * `gradientTransform`, shadows and glows become filters, inside and outside strokes use clip paths and
 * images are embedded once and reused.
 */
export function writeSvg(scene: Scene, images: ImageStore, options: SvgOptions = {}): { svg: string; warnings: ExportWarning[] } {
  const warnings: ExportWarning[] = [];
  const defs: string[] = [];
  const body: string[] = [];
  const imageIds = new Map<string, string | null>();
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}${++counter}`;
  const sep = options.minify ? '' : '\n';
  const emit = (depth: number, text: string) => body.push(options.minify ? text : `${'  '.repeat(depth)}${text}`);

  const paintAttr = (paint: ScenePaint, kind: 'fill' | 'stroke', opacity: number): string => {
    if (paint.kind === 'solid') {
      const alpha = paint.alpha * opacity;
      return `${kind}="${hex(paint.rgb)}"${alpha < 1 ? ` ${kind}-opacity="${num(alpha)}"` : ''}`;
    }
    const id = nextId('g');
    const stops = paint.stops
      .map((s) => `<stop offset="${num(s.offset)}" stop-color="${hex(s.rgb)}"${s.alpha < 1 ? ` stop-opacity="${num(s.alpha)}"` : ''}/>`)
      .join('');
    const common = `id="${id}" gradientUnits="userSpaceOnUse" gradientTransform="${matrixAttr(paint.transform)}"`;
    defs.push(paint.type === 'linear' ? `<linearGradient ${common} x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>` : `<radialGradient ${common} cx="0" cy="0" r="1">${stops}</radialGradient>`);
    return `${kind}="url(#${id})"${opacity < 1 ? ` ${kind}-opacity="${num(opacity)}"` : ''}`;
  };

  const clipDef = (path: ScenePath, matrix: Matrix | null, rule: 'nonzero' | 'evenodd'): string => {
    const id = nextId('c');
    const transform = matrix && matrix.some((v, i) => v !== [1, 0, 0, 1, 0, 0][i]) ? ` transform="${matrixAttr(matrix)}"` : '';
    defs.push(`<clipPath id="${id}"><path d="${pathData(path)}" clip-rule="${rule}"${transform}/></clipPath>`);
    return id;
  };

  const filterDef = (effect: SceneEffect): string => {
    const id = nextId('f');
    const offset = effect.type === 'shadow' ? `<feOffset dx="${num(effect.dx)}" dy="${num(effect.dy)}" result="o"/>` : '';
    const blurred = `<feGaussianBlur in="SourceAlpha" stdDeviation="${num(effect.blur / 2)}"${offset ? '' : ' result="o"'}/>`;
    defs.push(
      `<filter id="${id}" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB">${blurred}${offset}<feFlood flood-color="${hex(effect.rgb)}" flood-opacity="${num(effect.opacity)}"/><feComposite in2="o" operator="in"/></filter>`,
    );
    return id;
  };

  const imageDef = (hash: string): string | null => {
    if (imageIds.has(hash)) return imageIds.get(hash) ?? null;
    const bytes = images.get(hash);
    if (!bytes) {
      warnings.push({ code: 'image-missing', detail: hash });
      imageIds.set(hash, null);
      return null;
    }
    const id = nextId('i');
    const format = options.imageFormats?.[hash] ?? 'png';
    // A <symbol> is what <use width height> can size: a bare <image> would be drawn at its natural pixel size.
    defs.push(`<symbol id="${id}" viewBox="0 0 1 1" preserveAspectRatio="none"><image width="1" height="1" preserveAspectRatio="none" href="data:${MIME[format]};base64,${toBase64(bytes)}"/></symbol>`);
    imageIds.set(hash, id);
    return id;
  };

  const semantic = options.structure === 'semantic';

  /** `<tag geometry` of a path: a primitive in semantic mode, otherwise `<path d`. `d` is forced for clipped strokes. */
  const shapeOpen = (path: ScenePath, forcePath = false): string => {
    const p = path.primitive;
    if (!semantic || !p || forcePath) return `<path d="${pathData(path)}"`;
    if (p.kind === 'rect') return `<rect width="${num(p.w)}" height="${num(p.h)}"${p.radius > 0 ? ` rx="${num(p.radius)}"` : ''}`;
    const [cx, cy] = [num(p.w / 2), num(p.h / 2)];
    return p.w === p.h ? `<circle cx="${cx}" cy="${cy}" r="${num(p.w / 2)}"` : `<ellipse cx="${cx}" cy="${cy}" rx="${num(p.w / 2)}" ry="${num(p.h / 2)}"`;
  };
  const fillRule = (path: ScenePath): string => (path.rule === 'evenodd' && !(semantic && path.primitive) ? ' fill-rule="evenodd"' : '');

  /** Stroke presentation attributes (everything but the path and the paint of the fill). */
  const strokeAttrs = (op: Extract<SceneOp, { kind: 'stroke' }>, width: number): string => {
    const dash = op.dash && op.dash.length > 0 ? ` stroke-dasharray="${op.dash.map(num).join(' ')}"` : '';
    const join = op.join === 'miter' ? ` stroke-miterlimit="${num(op.miterLimit)}"` : '';
    return `${paintAttr(op.paint, 'stroke', op.opacity)} stroke-width="${num(width)}" stroke-linecap="${op.cap}" stroke-linejoin="${op.join}"${join}${dash}`;
  };

  /** Writes a list of operations; a fill followed by a centred stroke of the same contour is one element, as in any editor. */
  const writeAll = (ops: readonly SceneOp[], depth: number): void => {
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i] as SceneOp;
      const next = ops[i + 1];
      if (op.kind === 'fill' && next && next.kind === 'stroke' && next.align === 'center' && next.path === op.path) {
        if (pathData(op.path)) emit(depth, `${shapeOpen(op.path)} ${paintAttr(op.paint, 'fill', op.opacity)}${fillRule(op.path)} ${strokeAttrs(next, next.width)}/>`);
        i++;
        continue;
      }
      write(op, depth);
    }
  };

  const write = (op: SceneOp, depth: number): void => {
    switch (op.kind) {
      case 'fill': {
        const d = pathData(op.path);
        if (!d) return;
        emit(depth, `${shapeOpen(op.path)} ${paintAttr(op.paint, 'fill', op.opacity)}${fillRule(op.path)}/>`);
        return;
      }
      case 'stroke': {
        const d = pathData(op.path);
        if (!d) return;
        const clipped = op.align !== 'center';
        const width = clipped ? op.width * 2 : op.width;
        const attrs = `fill="none" ${strokeAttrs(op, width)}`;
        if (!clipped) {
          emit(depth, `${shapeOpen(op.path)} ${attrs}/>`);
          return;
        }
        const clip = op.align === 'inside' ? clipDef(op.path, null, op.path.rule) : clipDef(outsideClipPath(op.path), null, 'evenodd');
        emit(depth, `<g clip-path="url(#${clip})">`);
        emit(depth + 1, `${shapeOpen(op.path, true)} ${attrs}/>`);
        emit(depth, '</g>');
        return;
      }
      case 'image': {
        const id = imageDef(op.hash);
        if (id) emit(depth, `<use href="#${id}" width="${num(op.width)}" height="${num(op.height)}"/>`);
        return;
      }
      case 'group': {
        const attrs: string[] = [];
        if (op.matrix.some((v, i) => v !== [1, 0, 0, 1, 0, 0][i])) attrs.push(`transform="${matrixAttr(op.matrix)}"`);
        if (op.opacity < 1) attrs.push(`opacity="${num(op.opacity)}"`);
        if (op.blend !== 'normal') attrs.push(`style="mix-blend-mode:${BLEND_CSS[op.blend] ?? 'normal'}"`);
        if (op.clip) attrs.push(`clip-path="url(#${clipDef(op.clip.path, op.clip.matrix, op.clip.path.rule)})"`);
        if (op.effect) attrs.push(`filter="url(#${filterDef(op.effect)})"`);
        if (attrs.length === 0 && !(semantic && op.structural)) {
          writeAll(op.children, depth);
          return;
        }
        // An object that is a single element carries its own transform, opacity and blend mode: no wrapper.
        if (semantic && !op.structural && !op.clip && !op.effect) {
          const at = body.length;
          writeAll(op.children, depth);
          const line = body[at] ?? '';
          if (body.length - at === 1 && /^\s*<(path|rect|circle|ellipse) .*\/>$/.test(line)) {
            body[at] = line.replace(/^(\s*<\w+)/, `$1 ${attrs.join(' ')}`);
            return;
          }
          body.length = at;
        }
        emit(depth, attrs.length > 0 ? `<g ${attrs.join(' ')}>` : '<g>');
        writeAll(op.children, depth + 1);
        emit(depth, '</g>');
      }
    }
  };

  if (scene.background !== 'transparent') emit(1, `<rect width="${num(scene.width)}" height="${num(scene.height)}" fill="${hex(scene.background)}"/>`);
  writeAll(scene.ops, 1);

  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${num(scene.width)}" height="${num(scene.height)}" viewBox="0 0 ${num(scene.width)} ${num(scene.height)}">`;
  const defsBlock = defs.length > 0 ? `${options.minify ? '' : '  '}<defs>${sep}${defs.map((d) => (options.minify ? d : `    ${d}`)).join(sep)}${sep}${options.minify ? '' : '  '}</defs>${sep}` : '';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>${sep}${head}${sep}${defsBlock}${body.join(sep)}${sep}</svg>${sep}`;
  return { svg, warnings };
}

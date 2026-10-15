import { flattenSubPath } from '../geometry/path';
import type { ParagraphStyle, TextPath, TextRun, TextStyle, Vec2 } from '../model/types';
import { getFont, type FontFace } from './font';

// Text layout (specs/07 · Motor de texto): paragraphs, greedy line breaking, kerning, tracking,
// scales, baseline shift, alignment and justification. Pure: positions only, no drawing.

export const AUTO_LEADING = 1.2;
const SMALL_CAPS_SCALE = 0.8;
const SCRIPT_SCALE = 0.58;
const SUPERSCRIPT_RISE = 0.33;
const SUBSCRIPT_DROP = 0.2;

export interface PlacedGlyph {
  /** The character as drawn (after caps). */
  ch: string;
  /** Index in the plain text of the story. */
  index: number;
  /** Origin of the glyph: x along the line, y of the baseline (already shifted). */
  x: number;
  y: number;
  /** Horizontal advance including tracking and kerning, after scaling. */
  advance: number;
  style: TextStyle;
  font: FontFace;
  /** Effective size in pt (after small caps and scripts) and the scales applied to the outline. */
  size: number;
  sx: number;
  sy: number;
  line: number;
  missing: boolean;
}

export interface LayoutLine {
  index: number;
  /** Plain-text range [start, end) of the line, excluding its trailing newline. */
  start: number;
  end: number;
  /** Left edge of the line's content and its baseline. */
  x: number;
  y: number;
  width: number;
  ascent: number;
  descent: number;
  paragraph: number;
}

export interface Decoration {
  x0: number;
  x1: number;
  y: number;
  thickness: number;
}

export interface TextLayout {
  text: string;
  glyphs: PlacedGlyph[];
  lines: LayoutLine[];
  decorations: Decoration[];
  /** Union of the lines' boxes (x from the leftmost content to the rightmost, y from the first top to the last bottom). */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Area text: characters that did not fit start at this index (null when everything fits). */
  overflowAt: number | null;
  missingFont: boolean;
}

export interface LayoutInput {
  story: readonly TextRun[];
  paragraphs?: readonly ParagraphStyle[];
  kind: 'point' | 'area' | 'onPath';
  frame?: TextPath | null;
}

interface Char {
  ch: string;
  index: number;
  style: TextStyle;
}

export const plainText = (story: readonly TextRun[]): string => story.map((r) => r.text).join('');

function flatten(story: readonly TextRun[]): Char[] {
  const out: Char[] = [];
  let index = 0;
  for (const run of story) {
    for (const ch of run.text) {
      out.push({ ch, index, style: run.style });
      index += ch.length;
    }
  }
  return out;
}

// ── Measuring ───────────────────────────────────────────────────────────────────────

interface Metrics {
  ch: string;
  size: number;
  sx: number;
  sy: number;
  font: FontFace;
  missing: boolean;
  advance: number;
  rise: number;
}

function metricsOf(c: Char): Metrics {
  const s = c.style;
  const { font, missing } = getFont(s.fontFamily, s.fontStyle);
  let size = s.size;
  let ch = c.ch;
  let rise = s.baselineShift ?? 0;
  if (s.caps) ch = ch.toUpperCase();
  else if (s.smallCaps && ch !== ch.toUpperCase()) {
    ch = ch.toUpperCase();
    size *= SMALL_CAPS_SCALE;
  }
  if (s.superscript) {
    rise += s.size * SUPERSCRIPT_RISE;
    size *= SCRIPT_SCALE;
  } else if (s.subscript) {
    rise -= s.size * SUBSCRIPT_DROP;
    size *= SCRIPT_SCALE;
  }
  const sx = (s.hScale ?? 100) / 100;
  const sy = (s.vScale ?? 100) / 100;
  const glyph = font.glyph(ch);
  const advance = (glyph.advance / font.unitsPerEm) * size * sx + ((s.tracking ?? 0) / 1000) * size;
  return { ch, size, sx, sy, font, missing, advance, rise };
}

function kernBetween(a: Metrics, b: Metrics, style: TextStyle): number {
  const k = style.kerning ?? 'auto';
  if (k === 'none') return 0;
  const fromFont = a.font === b.font ? (a.font.kerning(a.ch, b.ch) / a.font.unitsPerEm) * a.size * a.sx : 0;
  return typeof k === 'number' ? fromFont + (k / 1000) * a.size : fromFont;
}

// ── Frame spans ─────────────────────────────────────────────────────────────────────

type Interval = [number, number];

function intervalsAt(polygons: readonly Vec2[][], y: number): Interval[] {
  const xs: number[] = [];
  for (const pts of polygons) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i] as Vec2;
      const b = pts[(i + 1) % pts.length] as Vec2;
      if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
  }
  xs.sort((p, q) => p - q);
  const out: Interval[] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i] as number, xs[i + 1] as number]);
  return out;
}

function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [a0, a1] of a) for (const [b0, b1] of b) if (Math.min(a1, b1) > Math.max(a0, b0)) out.push([Math.max(a0, b0), Math.min(a1, b1)]);
  return out;
}

/** The widest stretch of the frame that is free along the whole height of a line, or null. */
export function frameSpan(polygons: readonly Vec2[][], top: number, bottom: number): Interval | null {
  const lists = [top + 0.01, (top + bottom) / 2, bottom - 0.01].map((y) => intervalsAt(polygons, y));
  const common = lists.reduce((acc, next) => intersect(acc, next));
  let best: Interval | null = null;
  for (const i of common) if (!best || i[1] - i[0] > best[1] - best[0]) best = i;
  return best;
}

export function framePolygons(frame: TextPath): Vec2[][] {
  return [flattenSubPath({ anchors: frame.anchors, closed: true }, 0.25).points];
}

// ── Layout ──────────────────────────────────────────────────────────────────────────

type Para = Required<Pick<ParagraphStyle, 'align' | 'indentLeft' | 'indentRight' | 'indentFirst' | 'spaceBefore' | 'spaceAfter' | 'hyphenate'>>;

const paragraphDefaults = (p: ParagraphStyle | undefined): Para => ({
  align: p?.align ?? 'left',
  indentLeft: p?.indentLeft ?? 0,
  indentRight: p?.indentRight ?? 0,
  indentFirst: p?.indentFirst ?? 0,
  spaceBefore: p?.spaceBefore ?? 0,
  spaceAfter: p?.spaceAfter ?? 0,
  hyphenate: p?.hyphenate ?? false,
});

interface LineRange {
  from: number;
  to: number;
  /** The line was cut inside a word and a hyphen is added at its end. */
  hyphen: boolean;
}

/** Advance of character `i` including the kerning towards the next one inside the same line. */
function advanceWithKern(metrics: readonly Metrics[], para: readonly Char[], i: number, limit: number): number {
  const m = metrics[i] as Metrics;
  const next = metrics[i + 1];
  return m.advance + (next && i + 1 < limit ? kernBetween(m, next, (para[i] as Char).style) : 0);
}

/** Lays out a story. Point and on-path text start with the first baseline at y = 0; area text with its top at the frame's top. */
export function layoutText(input: LayoutInput): TextLayout {
  const chars = flatten(input.story);
  const text = plainText(input.story);
  const glyphs: PlacedGlyph[] = [];
  const lines: LayoutLine[] = [];
  const decorations: Decoration[] = [];
  const area = input.kind === 'area' && !!input.frame && input.frame.anchors.length >= 3;
  const polygons = area ? framePolygons(input.frame as TextPath) : [];
  const allPoints = polygons.flat();
  const frameBottom = area ? Math.max(...allPoints.map((p) => p.y)) : 0;
  const frameTop = area ? Math.min(...allPoints.map((p) => p.y)) : 0;
  const frameLeft = area ? Math.min(...allPoints.map((p) => p.x)) : 0;
  const frameRight = area ? Math.max(...allPoints.map((p) => p.x)) : 0;
  let overflowAt: number | null = null;
  let missingFont = false;

  // Paragraphs split on newlines (on-path text is a single line: a newline reads as a space).
  const paragraphs: Char[][] = [[]];
  for (const c of chars) {
    if (c.ch === '\n' && input.kind !== 'onPath') paragraphs.push([]);
    else paragraphs[paragraphs.length - 1]?.push(c.ch === '\n' ? { ...c, ch: ' ' } : c);
  }

  const fallbackStyle = chars[chars.length - 1]?.style ?? input.story[0]?.style;
  let cursorY = area ? frameTop : 0; // top of the next line (point text: set by the first line's ascent)
  let placedAny = false;

  for (let pIndex = 0; pIndex < paragraphs.length && overflowAt === null; pIndex++) {
    const para = paragraphs[pIndex] as Char[];
    const ps = paragraphDefaults(input.paragraphs?.[pIndex]);
    const metrics = para.map(metricsOf);
    if (metrics.some((m) => m.missing)) missingFont = true;

    const heightOf = (from: number, to: number) => {
      let ascent = 0;
      let descent = 0;
      let leading = 0;
      for (let i = from; i < Math.max(to, from + 1) && i < metrics.length; i++) {
        const m = metrics[i] as Metrics;
        const style = (para[i] as Char).style;
        ascent = Math.max(ascent, (m.font.ascender / m.font.unitsPerEm) * m.size * m.sy);
        descent = Math.max(descent, (-m.font.descender / m.font.unitsPerEm) * m.size * m.sy);
        leading = Math.max(leading, style.leading ?? style.size * AUTO_LEADING);
      }
      if (metrics.length === 0 || ascent === 0) {
        // An empty line still takes the height of the story's last known style.
        const size = fallbackStyle?.size ?? 12;
        const { font } = getFont(fallbackStyle?.fontFamily ?? '', fallbackStyle?.fontStyle ?? '');
        ascent = (font.ascender / font.unitsPerEm) * size;
        descent = (-font.descender / font.unitsPerEm) * size;
        leading = fallbackStyle?.leading ?? size * AUTO_LEADING;
      }
      return { ascent, descent, leading };
    };

    if (placedAny) cursorY += ps.spaceBefore;

    // Where the next line may go: [x0, x1] free along its height, or null above/below the frame.
    const spanFor = (top: number, height: number): Interval | null => (area ? frameSpan(polygons, top, top + height) : [-Infinity, Infinity]);

    // ── Break the paragraph into lines (greedy) ──
    const ranges: LineRange[] = [];
    let pos = 0;
    let probeTop = cursorY;
    let lineNo = 0;
    while (pos < metrics.length || (pos === 0 && metrics.length === 0 && ranges.length === 0)) {
      const est = heightOf(pos, pos + 1);
      let span = spanFor(probeTop, est.ascent + est.descent);
      let guard = 0;
      while (area && (!span || span[1] - span[0] < 2) && probeTop < frameBottom && guard++ < 500) {
        probeTop += est.leading / 4;
        span = spanFor(probeTop, est.ascent + est.descent);
      }
      const avail = span ? span[1] - span[0] - ps.indentLeft - ps.indentRight - (lineNo === 0 ? ps.indentFirst : 0) : 0;
      if (metrics.length === 0) {
        ranges.push({ from: 0, to: 0, hyphen: false });
        break;
      }
      let i = pos;
      let width = 0;
      let breakAt = -1; // start of the last run of spaces inside the line
      let to = -1;
      let hyphen = false;
      while (i < metrics.length) {
        const m = metrics[i] as Metrics;
        const adv = advanceWithKern(metrics, para, i, metrics.length);
        if (m.ch === ' ') {
          if (breakAt < 0 || (metrics[i - 1] as Metrics | undefined)?.ch !== ' ') breakAt = i;
          width += adv;
          i++;
          continue;
        }
        if (width + m.advance > avail + 1e-6 && i > pos && width > 0) {
          if (breakAt >= pos && breakAt > pos) {
            to = breakAt;
          } else {
            // A word wider than the line: cut it (with a hyphen when the paragraph allows it).
            to = i;
            if (ps.hyphenate && i - pos >= 3) {
              const dash = metricsOf({ ch: '-', index: 0, style: (para[i - 1] as Char).style }).advance;
              while (to - pos > 2 && width + dash > avail) {
                to--;
                width -= advanceWithKern(metrics, para, to, metrics.length);
              }
              hyphen = to - pos >= 2;
            }
          }
          break;
        }
        width += adv;
        i++;
      }
      if (to < 0) to = metrics.length;
      ranges.push({ from: pos, to, hyphen });
      // The next line starts after the spaces at the break.
      pos = to;
      while (pos < metrics.length && (metrics[pos] as Metrics).ch === ' ' && to < metrics.length && !hyphen) pos++;
      if (pos === to && to < metrics.length && (metrics[to] as Metrics).ch === ' ') pos = to;
      probeTop += est.leading;
      lineNo++;
      if (pos >= metrics.length) break;
    }

    // ── Place the lines ──
    for (let r = 0; r < ranges.length && overflowAt === null; r++) {
      const range = ranges[r] as LineRange;
      const isFirst = r === 0;
      const isLast = r === ranges.length - 1;
      let to = range.to;
      while (to > range.from && (metrics[to - 1] as Metrics).ch === ' ') to--; // trailing spaces take no room
      const from = range.from;
      const h = heightOf(from, to);
      const top = placedAny || area ? cursorY : -h.ascent;
      const baseline = top + h.ascent;
      const bottom = baseline + h.descent;
      if (area && bottom > frameBottom + 0.01) {
        overflowAt = (para[from] ?? chars[chars.length - 1])?.index ?? text.length;
        break;
      }
      const lineWidths: number[] = [];
      let width = 0;
      for (let i = from; i < to; i++) {
        const adv = advanceWithKern(metrics, para, i, to);
        lineWidths.push(adv);
        width += adv;
      }
      let dashAdvance = 0;
      if (range.hyphen && to > from) {
        dashAdvance = metricsOf({ ch: '-', index: 0, style: (para[to - 1] as Char).style }).advance;
        width += dashAdvance;
      }
      let x0 = 0;
      let x1 = 0;
      if (area) {
        const span = frameSpan(polygons, top, bottom) ?? ([frameLeft, frameRight] as Interval);
        x0 = span[0] + ps.indentLeft + (isFirst ? ps.indentFirst : 0);
        x1 = span[1] - ps.indentRight;
      }
      const justify = ps.align === 'justify' || ps.align === 'justifyCenter' || ps.align === 'justifyRight' || ps.align === 'justifyAll';
      const alignKind = ps.align === 'justify' || ps.align === 'justifyAll' ? 'left' : ps.align === 'justifyCenter' ? 'center' : ps.align === 'justifyRight' ? 'right' : ps.align;
      let extraPerSpace = 0;
      let used = width;
      if (area && justify && (!isLast || ps.align === 'justifyAll') && to > from) {
        const spaces = countSpaces(metrics, from, to);
        if (spaces > 0 && width < x1 - x0) {
          extraPerSpace = (x1 - x0 - width) / spaces;
          used = x1 - x0;
        }
      }
      const startX = area ? (alignKind === 'center' ? x0 + (x1 - x0 - used) / 2 : alignKind === 'right' ? x1 - used : x0) : alignKind === 'center' ? -width / 2 : alignKind === 'right' ? -width : 0;

      const lineIndex = lines.length;
      let x = startX;
      let underline: { x: number; size: number; font: FontFace } | null = null;
      let strike: { x: number; size: number; font: FontFace } | null = null;
      const decorate = (kind: 'u' | 's', open: { x: number; size: number; font: FontFace }, end: number) => {
        const thickness = Math.max(0.4, open.size / 18);
        const y = kind === 'u' ? baseline - ((open.font.underlinePosition ?? -open.font.unitsPerEm * 0.1) / open.font.unitsPerEm) * open.size : baseline - open.size * 0.3;
        decorations.push({ x0: open.x, x1: end, y, thickness });
      };
      for (let i = from; i < to; i++) {
        const m = metrics[i] as Metrics;
        const c = para[i] as Char;
        glyphs.push({ ch: m.ch, index: c.index, x, y: baseline - m.rise, advance: lineWidths[i - from] as number, style: c.style, font: m.font, size: m.size, sx: m.sx, sy: m.sy, line: lineIndex, missing: m.missing });
        if (c.style.underline) underline ??= { x, size: m.size, font: m.font };
        else if (underline) {
          decorate('u', underline, x);
          underline = null;
        }
        if (c.style.strikethrough) strike ??= { x, size: m.size, font: m.font };
        else if (strike) {
          decorate('s', strike, x);
          strike = null;
        }
        x += (lineWidths[i - from] as number) + (m.ch === ' ' ? extraPerSpace : 0);
      }
      if (range.hyphen && to > from) {
        const last = para[to - 1] as Char;
        const hm = metricsOf({ ch: '-', index: 0, style: last.style });
        glyphs.push({ ch: '-', index: last.index + last.ch.length, x, y: baseline, advance: dashAdvance, style: last.style, font: hm.font, size: hm.size, sx: hm.sx, sy: hm.sy, line: lineIndex, missing: hm.missing });
        x += dashAdvance;
      }
      if (underline) decorate('u', underline, x);
      if (strike) decorate('s', strike, x);
      const startIndex = (para[from] ?? para[Math.max(0, from - 1)])?.index ?? (chars[chars.length - 1]?.index ?? 0);
      const endIndex = to > from ? (para[to - 1] as Char).index + (para[to - 1] as Char).ch.length : startIndex;
      lines.push({ index: lineIndex, start: startIndex, end: endIndex, x: startX, y: baseline, width: x - startX, ascent: h.ascent, descent: h.descent, paragraph: pIndex });
      cursorY = top + h.leading;
      if (isLast) cursorY += ps.spaceAfter;
      placedAny = true;
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of lines) {
    minX = Math.min(minX, l.x);
    maxX = Math.max(maxX, l.x + l.width);
    minY = Math.min(minY, l.y - l.ascent);
    maxY = Math.max(maxY, l.y + l.descent);
  }
  const bounds = lines.length > 0 ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { text, glyphs, lines, decorations, bounds, overflowAt, missingFont };
}

function countSpaces(metrics: readonly Metrics[], from: number, to: number): number {
  let n = 0;
  for (let i = from; i < to; i++) if ((metrics[i] as Metrics).ch === ' ') n++;
  return n;
}


// ── Caret and picking ───────────────────────────────────────────────────────────────

export interface Caret {
  x: number;
  /** Top of the line and its height. */
  y: number;
  height: number;
  line: number;
}

/** Position of the caret before plain-text index `index` (text.length = after the last character). */
export function caretAt(layout: TextLayout, index: number): Caret {
  const lines = layout.lines;
  if (lines.length === 0) return { x: 0, y: 0, height: 12, line: 0 };
  const clamped = Math.max(0, Math.min(index, layout.text.length));
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] as LayoutLine;
    if (clamped >= line.start || i === 0) {
      const g = layout.glyphs.find((gl) => gl.line === line.index && gl.index >= clamped);
      const lineGlyphs = layout.glyphs.filter((gl) => gl.line === line.index);
      const x = g ? g.x : lineGlyphs.length > 0 ? (lineGlyphs[lineGlyphs.length - 1] as PlacedGlyph).x + (lineGlyphs[lineGlyphs.length - 1] as PlacedGlyph).advance : line.x;
      // An index in the gap between lines (a newline) belongs to the end of the earlier line.
      if (clamped > line.end && i < lines.length - 1 && clamped < (lines[i + 1] as LayoutLine).start) {
        return { x: line.x + line.width, y: line.y - line.ascent, height: line.ascent + line.descent, line: line.index };
      }
      return { x, y: line.y - line.ascent, height: line.ascent + line.descent, line: line.index };
    }
  }
  const first = lines[0] as LayoutLine;
  return { x: first.x, y: first.y - first.ascent, height: first.ascent + first.descent, line: 0 };
}

/** The character boundary nearest to a point (text-local coordinates). */
export function indexAt(layout: TextLayout, p: Vec2): number {
  const lines = layout.lines;
  if (lines.length === 0) return 0;
  let line = lines[0] as LayoutLine;
  for (const l of lines) {
    line = l;
    if (p.y <= l.y + l.descent) break;
  }
  const gs = layout.glyphs.filter((g) => g.line === line.index);
  if (gs.length === 0) return line.start;
  for (const g of gs) if (p.x < g.x + g.advance / 2) return g.index;
  const last = gs[gs.length - 1] as PlacedGlyph;
  return last.index + last.ch.length;
}

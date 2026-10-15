// Font abstraction of the text engine. The core never loads fonts (no DOM, no files): the renderer
// registers a provider backed by opentype.js, and everything here — layout, outlines, hit testing,
// Create Outlines — works on this small interface. Without a provider (tests, a font not loaded yet)
// a built-in fallback with box glyphs keeps layouts deterministic.

export type PathCmd =
  | { t: 'M' | 'L'; x: number; y: number }
  | { t: 'Q'; x1: number; y1: number; x: number; y: number }
  | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { t: 'Z' };

export interface GlyphData {
  /** Horizontal advance in font units. */
  advance: number;
  /** Outline in font units, Y up. Empty for spaces. */
  commands: PathCmd[];
}

export interface FontFace {
  unitsPerEm: number;
  /** Font units above the baseline (positive). */
  ascender: number;
  /** Font units below the baseline (negative). */
  descender: number;
  has(ch: string): boolean;
  glyph(ch: string): GlyphData;
  /** Kerning of a pair in font units (usually negative). */
  kerning(left: string, right: string): number;
  /** Underline position (below the baseline, negative) and thickness in font units, when the font says. */
  underlinePosition?: number;
  underlineThickness?: number;
}

export interface FontProvider {
  /** The face of a family and style, or null when it is not available (yet). */
  resolve(family: string, style: string): FontFace | null;
}

const box = (w: number, h: number): PathCmd[] => [
  { t: 'M', x: 60, y: 0 },
  { t: 'L', x: 60 + w, y: 0 },
  { t: 'L', x: 60 + w, y: h },
  { t: 'L', x: 60, y: h },
  { t: 'Z' },
];

/** 1000 upm, 600 advance, every visible character a 480×700 box: deterministic and obviously "no font". */
export const FALLBACK_FONT: FontFace = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  has: () => true,
  glyph: (ch) => ({ advance: ch === ' ' ? 300 : 600, commands: /\s/.test(ch) ? [] : box(480, 700) }),
  kerning: () => 0,
  underlinePosition: -100,
  underlineThickness: 60,
};

let provider: FontProvider | null = null;
let epoch = 0;

export function setFontProvider(next: FontProvider | null): void {
  provider = next;
  epoch++;
}

/** Changes whenever the set of loaded fonts changes, so cached layouts know to recompute. */
export const fontEpoch = (): number => epoch;

/** Call when a font finished loading in the background. */
export function bumpFontEpoch(): void {
  epoch++;
}

export function getFont(family: string, style: string): { font: FontFace; missing: boolean } {
  const found = provider?.resolve(family, style) ?? null;
  return found ? { font: found, missing: false } : { font: FALLBACK_FONT, missing: true };
}

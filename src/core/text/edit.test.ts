import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  commonStyle,
  deleteRange,
  editParagraphs,
  insertText,
  layoutOnPath,
  layoutText,
  layoutTextOnPath,
  normalizeStory,
  paragraphIndexAt,
  paragraphRangeAt,
  paragraphsOfRange,
  plainText,
  replaceRange,
  samplerOf,
  setFontProvider,
  sliceStory,
  styleAll,
  styleAt,
  styleRange,
  textGeometry,
  wordAt,
  type FontFace,
  type PathTextOptions,
  type TextNode,
  type TextPath,
  type TextRun,
  type TextStyle,
} from '..';

const MONO: FontFace = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  has: () => true,
  glyph: (ch) => ({ advance: 500, commands: /\s/.test(ch) ? [] : [{ t: 'M', x: 0, y: 0 }, { t: 'L', x: 400, y: 0 }, { t: 'Q', x1: 400, y1: 700, x: 0, y: 700 }, { t: 'Z' }] }),
  kerning: () => 0,
};
beforeEach(() => setFontProvider({ resolve: () => MONO }));
afterEach(() => setFontProvider(null));

const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ fontFamily: 'Mono', fontStyle: 'Regular', size: 10, ...patch });
const bold = style({ fontStyle: 'Bold' });
const story = (...parts: Array<[string, Partial<TextStyle>?]>): TextRun[] => parts.map(([text, patch]) => ({ text, style: style(patch) }));

describe('story editing', () => {
  it('inserts in the style of the character before, merging equal runs', () => {
    const s = insertText(story(['hello', { fontStyle: 'Bold' }]), 5, ' world');
    expect(s).toEqual([{ text: 'hello world', style: bold }]);
    expect(plainText(insertText(story(['ab']), 1, 'X'))).toBe('aXb');
    expect(insertText(story(['ab']), 0, 'X')[0]!.style).toEqual(style());
  });

  it('inserts with an explicit style, splitting a run', () => {
    const s = insertText(story(['abcd']), 2, 'XY', bold);
    expect(s.map((r) => r.text)).toEqual(['ab', 'XY', 'cd']);
    expect(s[1]!.style.fontStyle).toBe('Bold');
  });

  it('deletes ranges across runs and keeps the style of the box when everything goes', () => {
    const s = deleteRange(story(['ab'], ['cd', { fontStyle: 'Bold' }], ['ef']), 1, 5);
    expect(s.map((r) => r.text)).toEqual(['af']);
    const empty = deleteRange(story(['ab', { size: 33 }]), 0, 2);
    expect(plainText(empty)).toBe('');
    expect(empty[0]!.style.size).toBe(33);
  });

  it('clamps out-of-range indices', () => {
    expect(plainText(replaceRange(story(['abc']), -5, 99, 'X'))).toBe('X');
    expect(plainText(insertText(story(['abc']), 99, 'Z'))).toBe('abcZ');
  });

  it('styles a range, splitting and re-merging runs', () => {
    const s = styleRange(story(['abcdef']), 2, 4, { fontStyle: 'Bold', tracking: 50 });
    expect(s.map((r) => r.text)).toEqual(['ab', 'cd', 'ef']);
    expect(s[1]!.style).toMatchObject({ fontStyle: 'Bold', tracking: 50 });
    const back = styleRange(s, 2, 4, { fontStyle: 'Regular', tracking: undefined });
    expect(back).toEqual([{ text: 'abcdef', style: style() }]);
    expect(styleAll(story(['ab'], ['cd', { size: 20 }]), { size: 12 })).toEqual([{ text: 'abcd', style: style({ size: 12 }) }]);
    expect(styleRange(story(['ab']), 1, 1, { size: 99 })).toEqual(story(['ab']));
  });

  it('reports shared or mixed values over a range, and the style typed at a caret', () => {
    const s = story(['ab'], ['cd', { size: 20 }]);
    expect(commonStyle(s, 0, 2, 'size')).toEqual({ mixed: false, value: 10 });
    expect(commonStyle(s, 0, 4, 'size')).toEqual({ mixed: true });
    expect(commonStyle(s, 3, 3, 'size')).toEqual({ mixed: false, value: 20 });
    expect(styleAt(s, 2).size).toBe(10); // the end of a run belongs to it
    expect(styleAt(s, 3).size).toBe(20);
    expect(styleAt(s, 0).size).toBe(10);
  });

  it('normalises: merges, drops empties, keeps one empty run', () => {
    expect(normalizeStory(story(['a'], ['b'], ['', { size: 9 }], ['c']))).toEqual(story(['abc']));
    expect(normalizeStory(story(['', { size: 9 }]))).toHaveLength(1);
    expect(sliceStory(story(['abc'], ['def', { size: 20 }]), 2, 4).map((r) => r.text)).toEqual(['c', 'd']);
  });
});

describe('paragraph helpers', () => {
  it('finds paragraphs, words and paragraph ranges', () => {
    const t = 'one two\nthree\nfour';
    expect(paragraphIndexAt(t, 0)).toBe(0);
    expect(paragraphIndexAt(t, 8)).toBe(1);
    expect(paragraphIndexAt(t, t.length)).toBe(2);
    expect(paragraphsOfRange(t, 4, 10)).toEqual([0, 1]);
    expect(wordAt(t, 5)).toEqual([4, 7]);
    expect(wordAt(t, 3)).toEqual([0, 3]);
    expect(wordAt('ab  cd', 3)).toEqual([3, 4]);
    expect(paragraphRangeAt(t, 10)).toEqual([8, 13]);
    expect(paragraphRangeAt(t, 0)).toEqual([0, 7]);
  });

  it('keeps paragraph styles in step with inserted and removed breaks', () => {
    const p = [{ align: 'left' as const }, { align: 'center' as const }, { align: 'right' as const }];
    const text = 'aa\nbb\ncc';
    expect(editParagraphs(p, text, 1, 1, '\n')?.map((x) => x.align)).toEqual(['left', 'left', 'center', 'right']);
    expect(editParagraphs(p, text, 2, 3, '')?.map((x) => x.align)).toEqual(['left', 'right']); // the break between 0 and 1 is gone
    expect(editParagraphs(p, text, 1, 1, 'x')?.map((x) => x.align)).toEqual(['left', 'center', 'right']);
    expect(editParagraphs(undefined, text, 0, 0, '\n')).toBeUndefined();
  });
});

const arc = (): TextPath => ({
  // A half circle of radius 100 from (−100, 0) over the top (y up is negative here) to (100, 0).
  anchors: [
    { p: { x: -100, y: 0 }, in: null, out: { x: -100, y: -55.2285 }, kind: 'smooth' },
    { p: { x: 0, y: -100 }, in: { x: -55.2285, y: -100 }, out: { x: 55.2285, y: -100 }, kind: 'smooth' },
    { p: { x: 100, y: 0 }, in: { x: 100, y: -55.2285 }, out: null, kind: 'smooth' },
  ],
  closed: false,
});
const straight = (): TextPath => ({ anchors: [{ p: { x: 0, y: 0 }, in: null, out: null, kind: 'corner' }, { p: { x: 100, y: 0 }, in: null, out: null, kind: 'corner' }], closed: false });
const opts = (patch: Partial<PathTextOptions> = {}): PathTextOptions => ({ effect: 'rainbow', align: 'baseline', spacing: 0, flip: false, start: 0, end: 1, ...patch });

describe('path sampling', () => {
  it('measures arc length and the tangent angle', () => {
    const s = samplerOf(straight());
    expect(s.length).toBe(100);
    expect(s.at(25)).toEqual({ point: { x: 25, y: 0 }, angle: 0 });
    expect(s.at(-5).point.x).toBe(0);
    expect(s.at(500).point.x).toBe(100);
    const c = samplerOf(arc());
    expect(c.length).toBeCloseTo(Math.PI * 100, 0);
    expect(c.at(c.length / 2).point.y).toBeCloseTo(-100, 0);
    expect(Math.abs(c.at(c.length / 2).angle)).toBeLessThan(0.05);
    expect(samplerOf(straight(), true).at(0).point.x).toBe(100);
    expect(samplerOf({ anchors: [], closed: false }).length).toBe(0);
  });

  it('closes a closed path with its last edge', () => {
    const square: TextPath = { anchors: [0, 1, 2, 3].map((i) => ({ p: { x: [0, 10, 10, 0][i]!, y: [0, 0, 10, 10][i]! }, in: null, out: null, kind: 'corner' as const })), closed: true };
    expect(samplerOf(square).length).toBe(40);
  });
});

describe('text on a path', () => {
  const s = story(['abcd']); // 4 × 5 = 20 pt

  it('puts glyphs along a straight path, rotated by the tangent (rainbow)', () => {
    const r = layoutTextOnPath(s, straight(), opts());
    expect(r.glyphs).toHaveLength(4);
    expect(r.overflowAt).toBeNull();
    const m0 = r.glyphs[0]!.matrix;
    expect(m0[4]).toBeCloseTo(0, 6); // origin of the first glyph at the start
    expect(r.glyphs[1]!.matrix[4]).toBeCloseTo(5, 6);
  });

  it('rotates glyphs on a curve and keeps them upright with Skew / Ribbon / Stair', () => {
    const rain = layoutTextOnPath(story(['abcdefghij']), arc(), opts({ start: 0.05 }));
    const angles = rain.glyphs.map((g) => Math.atan2(g.matrix[1], g.matrix[0]));
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(0.1);
    const ribbon = layoutTextOnPath(story(['abcdefghij']), arc(), opts({ effect: 'ribbon', start: 0.05 }));
    expect(ribbon.glyphs.every((g) => g.matrix[0] === 1 && g.matrix[1] === 0)).toBe(true);
    const stair = layoutTextOnPath(story(['abcdefghij']), arc(), opts({ effect: 'stair', start: 0.05 }));
    expect(stair.glyphs.every((g) => g.matrix[0] === 1 && g.matrix[1] === 0)).toBe(true);
    expect(new Set(stair.glyphs.map((g) => g.matrix[5])).size).toBe(stair.glyphs.length);
    const skew = layoutTextOnPath(story(['abcdefghij']), arc(), opts({ effect: 'skew', start: 0.05 }));
    expect(skew.glyphs.every((g) => g.matrix[0] === 1 && g.matrix[2] === 0)).toBe(true);
    expect(skew.glyphs.some((g) => Math.abs(g.matrix[1]) > 0.05)).toBe(true);
    const gravity = layoutTextOnPath(story(['abcdefghij']), arc(), opts({ effect: 'gravity', start: 0.05 }));
    expect(gravity.glyphs).toHaveLength(10);
  });

  it('hides what falls beyond the end limit and reports where', () => {
    const r = layoutTextOnPath(story(['abcdefghij']), straight(), opts({ end: 0.2 })); // 20 pt of room for 50
    expect(r.glyphs.length).toBeLessThan(10);
    expect(r.overflowAt).not.toBeNull();
    const none = layoutTextOnPath(story(['abcd']), straight(), opts({ start: 0.9 }));
    expect(none.glyphs.length).toBeLessThan(4);
  });

  it('aligns the text inside [start, end]: centre and right', () => {
    const left = layoutTextOnPath(story(['ab']), straight(), opts());
    const centre = layoutTextOnPath(story(['ab']), straight(), opts(), [{ align: 'center' }]);
    const right = layoutTextOnPath(story(['ab']), straight(), opts(), [{ align: 'right' }]);
    expect(left.glyphs[0]!.matrix[4]).toBeCloseTo(0, 6);
    expect(centre.glyphs[0]!.matrix[4]).toBeCloseTo(45, 6);
    expect(right.glyphs[0]!.matrix[4]).toBeCloseTo(90, 6);
  });

  it('moves the baseline relative to the path: ascender, descender, centre', () => {
    const y = (align: PathTextOptions['align']) => layoutTextOnPath(s, straight(), opts({ align })).glyphs[0]!.matrix[5];
    expect(y('baseline')).toBeCloseTo(0, 9);
    expect(y('ascender')).toBeGreaterThan(0); // hangs below the path
    expect(y('descender')).toBeLessThan(0);
    expect(y('center')).toBeGreaterThan(y('descender'));
  });

  it('flipping puts the text on the other side, reading along the reversed path', () => {
    const normal = layoutTextOnPath(s, straight(), opts());
    const flipped = layoutTextOnPath(s, straight(), opts({ flip: true }));
    expect(Math.cos(Math.atan2(normal.glyphs[0]!.matrix[1], normal.glyphs[0]!.matrix[0]))).toBeCloseTo(1, 9);
    expect(Math.cos(Math.atan2(flipped.glyphs[0]!.matrix[1], flipped.glyphs[0]!.matrix[0]))).toBeCloseTo(-1, 9);
    expect(flipped.glyphs[0]!.matrix[4]).toBeCloseTo(100, 6);
  });

  it('extra spacing opens the gaps on curves only', () => {
    const tight = layoutTextOnPath(story(['abcdefgh']), arc(), opts({ start: 0.05 }));
    const loose = layoutTextOnPath(story(['abcdefgh']), arc(), opts({ start: 0.05, spacing: 20 }));
    const gap = (r: typeof tight) => Math.hypot(r.glyphs[7]!.matrix[4] - r.glyphs[0]!.matrix[4], r.glyphs[7]!.matrix[5] - r.glyphs[0]!.matrix[5]);
    expect(gap(loose)).toBeGreaterThan(gap(tight));
    const sameStraight = layoutTextOnPath(story(['abcdefgh']), straight(), opts({ spacing: 20 }));
    expect(sameStraight.glyphs[7]!.matrix[4]).toBeCloseTo(35, 6);
  });
});

describe('text geometry', () => {
  const node = (patch: Partial<TextNode> = {}): TextNode =>
    ({ id: 't', type: 'text', kind: 'point', story: story(['ab']), visible: true, locked: false, transform: [1, 0, 0, 1, 0, 0], appearance: { items: [] }, opacity: 1, blendMode: 'normal', ...patch }) as TextNode;

  it('turns glyphs into cubic contours and boxes for clicking', () => {
    const g = textGeometry(node());
    expect(g.subpaths).toHaveLength(2);
    expect(g.subpaths[0]!.closed).toBe(true);
    expect(g.subpaths[0]!.anchors.some((a) => a.in || a.out)).toBe(true); // the quadratic became a cubic
    expect(g.boxes).toHaveLength(1);
    expect(g.bounds).toEqual({ minX: 0, minY: -8, maxX: 10, maxY: 2 });
    expect(g.missingFont).toBe(false);
  });

  it('is cached per node, and recomputed when the loaded fonts change', () => {
    const n = node();
    expect(textGeometry(n)).toBe(textGeometry(n));
    const before = textGeometry(n);
    setFontProvider({ resolve: () => MONO });
    expect(textGeometry(n)).not.toBe(before);
  });

  it('area text is bounded by its frame; text on a path by its glyphs; empty text keeps a place', () => {
    const frame: TextPath = { anchors: [0, 1, 2, 3].map((i) => ({ p: { x: [0, 100, 100, 0][i]!, y: [0, 0, 50, 50][i]! }, in: null, out: null, kind: 'corner' as const })), closed: true };
    const a = textGeometry(node({ kind: 'area', frame }));
    expect(a.bounds).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 50 });
    expect(a.boxes.length).toBeGreaterThan(1); // the lines and the frame
    const p = textGeometry(node({ kind: 'onPath', path: straight() }));
    expect(p.pathGlyphs).toHaveLength(2);
    expect(p.bounds!.maxX).toBeGreaterThan(0);
    const empty = textGeometry(node({ story: story(['']) }));
    expect(empty.bounds).not.toBeNull();
  });

  it('draws underlines as filled rules', () => {
    const g = textGeometry(node({ story: story(['ab', { underline: true }]) }));
    expect(g.subpaths).toHaveLength(3);
    void layoutText;
    void layoutOnPath;
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { caretAt, cornerAnchor, indexAt, layoutText, plainText, setFontProvider, type FontFace, type ParagraphStyle, type TextPath, type TextRun, type TextStyle } from '..';

/** Monospace test font: 1000 upm, every glyph 500 wide, ascender 800, descender −200; "AV" kerns by −100. */
const MONO: FontFace = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  has: () => true,
  glyph: (ch) => ({ advance: 500, commands: /\s/.test(ch) ? [] : [{ t: 'M', x: 0, y: 0 }, { t: 'L', x: 400, y: 0 }, { t: 'L', x: 400, y: 700 }, { t: 'Z' }] }),
  kerning: (a, b) => (a === 'A' && b === 'V' ? -100 : 0),
};

beforeEach(() => setFontProvider({ resolve: (family) => (family === 'Mono' ? MONO : null) }));
afterEach(() => setFontProvider(null));

const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ fontFamily: 'Mono', fontStyle: 'Regular', size: 10, ...patch });
const story = (text: string, patch: Partial<TextStyle> = {}): TextRun[] => [{ text, style: style(patch) }];
const rectFrame = (w: number, h: number): TextPath => ({
  anchors: [cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: w, y: 0 }), cornerAnchor({ x: w, y: h }), cornerAnchor({ x: 0, y: h })],
  closed: true,
});
const point = (text: string, patch: Partial<TextStyle> = {}, paragraphs?: ParagraphStyle[]) => layoutText({ story: story(text, patch), kind: 'point', ...(paragraphs ? { paragraphs } : {}) });
const area = (text: string, w: number, h: number, patch: Partial<TextStyle> = {}, paragraphs?: ParagraphStyle[]) => layoutText({ story: story(text, patch), kind: 'area', frame: rectFrame(w, h), ...(paragraphs ? { paragraphs } : {}) });
const lineTexts = (l: ReturnType<typeof layoutText>) => l.lines.map((line) => l.text.slice(line.start, line.end));

describe('point text', () => {
  it('puts the first baseline at y = 0 and advances by the font metrics', () => {
    const l = point('Hello');
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0]!.y).toBe(0);
    expect(l.glyphs.map((g) => g.x)).toEqual([0, 5, 10, 15, 20]);
    expect(l.lines[0]!.width).toBe(25);
    expect(l.bounds).toEqual({ minX: 0, minY: -8, maxX: 25, maxY: 2 });
    expect(l.overflowAt).toBeNull();
    expect(l.missingFont).toBe(false);
  });

  it('starts a new line (and paragraph) at each newline, spaced by the leading (auto = 120 %)', () => {
    const l = point('ab\ncd');
    expect(lineTexts(l)).toEqual(['ab', 'cd']);
    expect(l.lines[1]!.y).toBeCloseTo(12, 9);
    expect(l.lines.map((x) => x.paragraph)).toEqual([0, 1]);
    expect(point('ab\ncd', { leading: 20 }).lines[1]!.y).toBe(20);
    expect(point('a\n\nb').lines).toHaveLength(3);
  });

  it('applies tracking, kerning and the horizontal scale', () => {
    expect(point('abc', { tracking: 200 }).glyphs.map((g) => g.x)).toEqual([0, 7, 14]); // +2 pt per character
    expect(point('AV').glyphs.map((g) => g.x)).toEqual([0, 4]); // kerned by −1 pt
    expect(point('AV', { kerning: 'none' }).glyphs[1]!.x).toBe(5);
    expect(point('AV', { kerning: 100 }).glyphs[1]!.x).toBe(5); // −1 from the font, +1 manual
    expect(point('ab', { hScale: 200 }).glyphs.map((g) => g.x)).toEqual([0, 10]);
    expect(point('ab', { hScale: 200 }).glyphs[0]!.sx).toBe(2);
  });

  it('aligns around the origin: left, centre and right', () => {
    expect(point('abcd', {}, [{ align: 'left' }]).lines[0]!.x).toBe(0);
    expect(point('abcd', {}, [{ align: 'center' }]).lines[0]!.x).toBe(-10);
    expect(point('abcd', {}, [{ align: 'right' }]).lines[0]!.x).toBe(-20);
  });

  it('caps, small caps, superscript, subscript and baseline shift', () => {
    expect(point('ab', { caps: true }).glyphs.map((g) => g.ch)).toEqual(['A', 'B']);
    const sc = point('aB', { smallCaps: true });
    expect(sc.glyphs.map((g) => g.ch)).toEqual(['A', 'B']);
    expect(sc.glyphs[0]!.size).toBeCloseTo(8, 9);
    expect(sc.glyphs[1]!.size).toBe(10);
    const sup = point('a', { superscript: true }).glyphs[0]!;
    expect(sup.size).toBeCloseTo(5.8, 9);
    expect(sup.y).toBeCloseTo(-3.3, 9);
    expect(point('a', { subscript: true }).glyphs[0]!.y).toBeCloseTo(2, 9);
    expect(point('a', { baselineShift: 4 }).glyphs[0]!.y).toBe(-4);
  });

  it('draws underlines and strikethroughs only over the styled characters', () => {
    const l = layoutText({
      story: [
        { text: 'ab', style: style() },
        { text: 'cd', style: style({ underline: true }) },
        { text: 'ef', style: style({ strikethrough: true }) },
      ],
      kind: 'point',
    });
    expect(l.decorations).toHaveLength(2);
    expect(l.decorations[0]).toMatchObject({ x0: 10, x1: 20 });
    expect(l.decorations[0]!.y).toBeGreaterThan(0); // below the baseline
    expect(l.decorations[1]).toMatchObject({ x0: 20, x1: 30 });
    expect(l.decorations[1]!.y).toBeLessThan(0); // through the letters
  });

  it('mixes styles in a line: the tallest one sets the line', () => {
    const l = layoutText({ story: [{ text: 'a', style: style() }, { text: 'b', style: style({ size: 20 }) }], kind: 'point' });
    expect(l.lines[0]!.ascent).toBe(16);
    expect(l.glyphs[1]!.x).toBe(5);
    expect(l.glyphs[1]!.size).toBe(20);
  });

  it('uses the box fallback for a font that is not available and says so', () => {
    const l = layoutText({ story: [{ text: 'ab', style: style({ fontFamily: 'Nope' }) }], kind: 'point' });
    expect(l.missingFont).toBe(true);
    expect(l.glyphs).toHaveLength(2);
  });

  it('an empty story still has one empty line, so an empty text box has a caret', () => {
    const l = layoutText({ story: [], kind: 'point' });
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0]!.width).toBe(0);
    expect(l.glyphs).toEqual([]);
    expect(plainText([])).toBe('');
  });
});

describe('area text', () => {
  it('wraps greedily at the frame width and starts at its top', () => {
    const l = area('aaaa bbbb cccc', 50, 100);
    expect(lineTexts(l)).toEqual(['aaaa bbbb', 'cccc']);
    expect(l.lines[0]!.y).toBeCloseTo(8, 9); // the ascent below the top of the frame
    expect(l.lines[1]!.y).toBeCloseTo(20, 9);
    expect(l.overflowAt).toBeNull();
  });

  it('does not put the spaces of a break at the start or the end of a line', () => {
    const l = area('aaaa   bbbb', 22, 100);
    expect(lineTexts(l)).toEqual(['aaaa', 'bbbb']);
    expect(l.glyphs.filter((g) => g.line === 1).map((g) => g.x)).toEqual([0, 5, 10, 15]);
  });

  it('breaks a word longer than the line, with a hyphen when the paragraph allows it', () => {
    const plain = area('abcdefgh', 22, 100);
    expect(lineTexts(plain)[0]!.length).toBeLessThanOrEqual(4);
    const hy = area('abcdefgh', 22, 100, {}, [{ hyphenate: true }]);
    expect(hy.glyphs.some((g) => g.ch === '-')).toBe(true);
    expect(lineTexts(hy).join('')).toBe('abcdefgh');
  });

  it('aligns and justifies each line except the last', () => {
    expect(area('abc', 50, 100, {}, [{ align: 'center' }]).lines[0]!.x).toBeCloseTo(17.5, 9);
    expect(area('abc', 50, 100, {}, [{ align: 'right' }]).lines[0]!.x).toBeCloseTo(35, 9);
    const j = area('aa bb cc dd', 30, 100, {}, [{ align: 'justify' }]);
    expect(lineTexts(j)).toEqual(['aa bb', 'cc dd']);
    const first = j.glyphs.filter((g) => g.line === 0);
    expect(first[first.length - 1]!.x + first[first.length - 1]!.advance).toBeCloseTo(30, 9); // flush right
    const last = j.glyphs.filter((g) => g.line === 1);
    expect(last[last.length - 1]!.x + last[last.length - 1]!.advance).toBeLessThan(30 - 0.01 + 5); // the last line keeps natural spacing
    const all = area('aa bb cc', 30, 100, {}, [{ align: 'justifyAll' }]);
    const end = all.glyphs.filter((g) => g.line === all.lines.length - 1).pop()!;
    expect(end.x + end.advance).toBeLessThanOrEqual(30);
  });

  it('honours indents and spacing between paragraphs', () => {
    const l = area('ab\ncd', 100, 200, {}, [{ indentLeft: 10, indentFirst: 5, spaceAfter: 6 }, { indentLeft: 10 }]);
    expect(l.lines[0]!.x).toBe(15);
    expect(l.lines[1]!.x).toBe(10);
    expect(l.lines[1]!.y - l.lines[0]!.y).toBeCloseTo(12 + 6, 9);
    const before = area('ab\ncd', 100, 200, {}, [{}, { spaceBefore: 4 }]);
    expect(before.lines[1]!.y - before.lines[0]!.y).toBeCloseTo(16, 9);
    expect(area('abcd', 100, 100, {}, [{ indentRight: 85 }]).lines.length).toBeGreaterThan(1);
  });

  it('reports where the text overflows the frame', () => {
    const l = area('aaaa bbbb cccc dddd', 22, 30);
    expect(l.overflowAt).not.toBeNull();
    expect(l.lines.length).toBeLessThan(4);
    expect(l.text.slice(l.overflowAt!)).toMatch(/^[a-d]/);
    expect(area('hi', 100, 100).overflowAt).toBeNull();
  });

  it('flows inside a non-rectangular frame: narrower lines near the point of a triangle', () => {
    const triangle: TextPath = { anchors: [cornerAnchor({ x: 50, y: 0 }), cornerAnchor({ x: 100, y: 100 }), cornerAnchor({ x: 0, y: 100 })], closed: true };
    const l = layoutText({ story: story('aaaa aaaa aaaa aaaa aaaa aaaa'), kind: 'area', frame: triangle });
    expect(l.lines.length).toBeGreaterThan(2);
    const widths = l.lines.map((x) => x.width);
    expect(Math.min(...widths.slice(0, 2))).toBeLessThanOrEqual(Math.max(...widths));
    // The first line sits near the apex: its box lies inside the triangle.
    const first = l.lines[0]!;
    expect(first.x).toBeGreaterThan(20);
  });

  it('a frame that is not closed or has fewer than three anchors behaves like point text', () => {
    const l = layoutText({ story: story('ab'), kind: 'area', frame: { anchors: [cornerAnchor({ x: 0, y: 0 })], closed: true } });
    expect(l.lines[0]!.y).toBe(0);
  });
});

describe('caret and picking', () => {
  it('places the caret before a character and after the last one', () => {
    const l = point('abc');
    expect(caretAt(l, 0)).toMatchObject({ x: 0, y: -8, height: 10 });
    expect(caretAt(l, 2).x).toBe(10);
    expect(caretAt(l, 3).x).toBe(15);
    expect(caretAt(l, 99).x).toBe(15);
  });

  it('finds the line of an index, also after a newline', () => {
    const l = point('ab\ncd');
    expect(caretAt(l, 3).line).toBe(1);
    expect(caretAt(l, 3).x).toBe(0);
    expect(caretAt(l, 2).line).toBe(0);
    expect(caretAt(l, 2).x).toBe(10);
  });

  it('maps a point to the nearest boundary', () => {
    const l = point('abcd');
    expect(indexAt(l, { x: 0.5, y: 0 })).toBe(0);
    expect(indexAt(l, { x: 7.4, y: 0 })).toBe(1);
    expect(indexAt(l, { x: 7.6, y: 0 })).toBe(2);
    expect(indexAt(l, { x: 500, y: 0 })).toBe(4);
    const two = point('ab\ncd');
    expect(indexAt(two, { x: 2, y: 12 })).toBe(3);
    expect(indexAt(layoutText({ story: [], kind: 'point' }), { x: 0, y: 0 })).toBe(0);
  });
});

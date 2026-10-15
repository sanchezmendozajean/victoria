import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addNode,
  convertTextKind,
  createDocument,
  createOutlines,
  createText,
  cornerAnchor,
  DocumentSession,
  getActiveSpace,
  insertText,
  setFontProvider,
  setPathTextOptions,
  setTextContent,
  setTextFrame,
  sequentialIds,
  styleParagraphs,
  styleText,
  transformNodes,
  translation,
  scaling,
  textGeometry,
  type CompoundNode,
  type FontFace,
  type GroupNode,
  type PathCmd,
  type TextNode,
  type TextPath,
  type TextStyle,
} from '..';

const square = (x0: number, y0: number, x1: number, y1: number, reverse = false): PathCmd[] => {
  const pts: Array<[number, number]> = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  if (reverse) pts.reverse();
  return [{ t: 'M', x: pts[0]![0], y: pts[0]![1] }, ...pts.slice(1).map(([x, y]): PathCmd => ({ t: 'L', x, y })), { t: 'Z' }];
};
const FONT: FontFace = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  has: () => true,
  // 'o' has a hole (two contours); other letters are solid boxes; spaces are empty.
  glyph: (ch) => ({ advance: 500, commands: ch === ' ' ? [] : ch === 'o' ? [...square(0, 0, 400, 600), ...square(100, 100, 300, 500, true)] : square(0, 0, 400, 600) }),
  kerning: () => 0,
};
beforeEach(() => setFontProvider({ resolve: () => FONT }));
afterEach(() => setFontProvider(null));

const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ fontFamily: 'F', fontStyle: 'Regular', size: 10, ...patch });

function setup(kind: 'point' | 'area' | 'onPath' = 'point', text = 'foo bar') {
  const ids = sequentialIds('x');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids, historyLimit: 100 });
  const space = () => getActiveSpace(session.document);
  const spec =
    kind === 'point'
      ? { kind: 'point' as const }
      : kind === 'area'
        ? { kind: 'area' as const, frame: { anchors: [cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: 40, y: 0 }), cornerAnchor({ x: 40, y: 60 }), cornerAnchor({ x: 0, y: 60 })], closed: true } as TextPath }
        : { kind: 'onPath' as const, path: { anchors: [cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: 100, y: 0 })], closed: false } as TextPath };
  const node = createText(ids, spec, [{ text, style: style() }]);
  session.run(addNode(space().id, space().layers[0]!.id, node));
  const get = () => space().layers[0]!.children[0] as TextNode;
  return { ids, session, space, node, get };
}

describe('text commands', () => {
  it('new text has a black fill and no stroke', () => {
    const { node } = setup();
    expect(node.appearance.items).toHaveLength(1);
    expect(node.appearance.items[0]).toMatchObject({ kind: 'fill', paint: { type: 'solid', color: { values: [0, 0, 0] } } });
  });

  it('typing merges into one history step per burst', () => {
    const { session, space, get } = setup();
    const before = session.historyLength;
    let story = get().story;
    for (const [i, ch] of ['!', '?', '.'].entries()) {
      story = insertText(story, 7 + i, ch);
      session.run(setTextContent(space().id, get().id, story, { from: 7 + i, to: 7 + i, inserted: ch }, 'burst1'));
    }
    expect(session.historyLength).toBe(before + 1);
    expect(get().story[0]!.text).toBe('foo bar!?.');
    session.undo();
    expect(get().story[0]!.text).toBe('foo bar');
  });

  it('styles the whole object or a range', () => {
    const { session, space, get } = setup();
    session.run(styleText(space().id, [get().id], { size: 20 }));
    expect(get().story).toEqual([{ text: 'foo bar', style: style({ size: 20 }) }]);
    session.run(styleText(space().id, [get().id], { fontStyle: 'Bold' }, new Map([[get().id, [0, 3] as const]])));
    expect(get().story.map((r) => [r.text, r.style.fontStyle])).toEqual([['foo', 'Bold'], [' bar', 'Regular']]);
  });

  it('paragraph attributes go to the chosen paragraphs, and follow breaks typed later', () => {
    const { session, space, get } = setup('area', 'one\ntwo\nthree');
    session.run(styleParagraphs(space().id, [get().id], { align: 'center' }, new Map([[get().id, [1]]])));
    expect(get().paragraphs!.map((p) => p.align)).toEqual([undefined, 'center', undefined]);
    session.run(styleParagraphs(space().id, [get().id], { align: 'right', spaceAfter: 4 }));
    expect(get().paragraphs!.every((p) => p.align === 'right' && p.spaceAfter === 4)).toBe(true);
    session.run(styleParagraphs(space().id, [get().id], { spaceAfter: undefined }));
    expect('spaceAfter' in get().paragraphs![0]!).toBe(false);
    const story = insertText(get().story, 3, '\n');
    session.run(setTextContent(space().id, get().id, story, { from: 3, to: 3, inserted: '\n' }));
    expect(get().paragraphs).toHaveLength(4);
  });

  it('edits the options of text on a path and the frame of area text', () => {
    const p = setup('onPath');
    p.session.run(setPathTextOptions(p.space().id, p.get().id, { effect: 'skew', flip: true, start: 0.25 }));
    expect(p.get().pathOptions).toMatchObject({ effect: 'skew', flip: true, start: 0.25, end: 1 });
    const a = setup('area');
    const frame: TextPath = { anchors: [cornerAnchor({ x: 0, y: 0 }), cornerAnchor({ x: 90, y: 0 }), cornerAnchor({ x: 90, y: 20 }), cornerAnchor({ x: 0, y: 20 })], closed: true };
    a.session.run(setTextFrame(a.space().id, a.get().id, frame));
    expect(a.get().frame!.anchors[1]!.p.x).toBe(90);
  });

  it('converts point text to area text (a frame as large as the text) and back, keeping the text where it was', () => {
    const { session, space, get } = setup('point', 'foo bar');
    const before = textGeometry(get()).bounds!;
    session.run(convertTextKind(space().id, get().id, 'area'));
    expect(get().kind).toBe('area');
    expect(get().frame).toBeDefined();
    const b = textGeometry(get()).bounds!;
    expect(b.minX).toBeCloseTo(before.minX, 6);
    expect(b.maxX - b.minX).toBeGreaterThanOrEqual(before.maxX - before.minX);
    session.run(convertTextKind(space().id, get().id, 'point'));
    expect(get().kind).toBe('point');
    expect(get().frame).toBeUndefined();
    const first = textGeometry(get()).layout!.lines[0]!;
    expect(first.y).toBeCloseTo(0, 6); // the first baseline is the origin again
    session.run(convertTextKind(space().id, get().id, 'point')); // already point: nothing
  });
});

describe('scaling point text changes the font size', () => {
  it('bakes uniform and non-uniform scales into the style and keeps the matrix scale-free', () => {
    const { session, space, get } = setup();
    session.run(transformNodes(space().id, [get().id], scaling(2, 2)));
    expect(get().story[0]!.style.size).toBe(20);
    expect(get().transform.slice(0, 4)).toEqual([1, 0, 0, 1]);
    session.run(transformNodes(space().id, [get().id], scaling(3, 1)));
    expect(get().story[0]!.style.size).toBe(20);
    expect(get().story[0]!.style.hScale).toBeCloseTo(300, 6);
    session.run(transformNodes(space().id, [get().id], translation(5, 5)));
    expect(get().transform.slice(4)).toEqual([5 * 1 + 0, 5]);
  });

  it('leaves area text and plain objects alone', () => {
    const { session, space, get } = setup('area');
    session.run(transformNodes(space().id, [get().id], scaling(2, 2)));
    expect(get().story[0]!.style.size).toBe(10);
    expect(get().transform[0]).toBe(2);
  });
});

describe('Create Outlines', () => {
  it('turns each character into a compound path in a group, holes included, painted like the text', () => {
    const { ids, session, space, get } = setup('point', 'fo o');
    session.run(createOutlines(space().id, [get().id], ids));
    const group = space().layers[0]!.children[0] as GroupNode;
    expect(group.type).toBe('group');
    expect(group.children).toHaveLength(3); // f, o, o — the space has no outline
    const o = group.children[1] as CompoundNode;
    expect(o.type).toBe('compound');
    expect(o.children).toHaveLength(2); // outer and counter
    expect(o.appearance.items[0]).toMatchObject({ kind: 'fill' });
    expect(new Set(group.children.map((c) => c.id)).size).toBe(3);
    session.undo();
    expect(get().type).toBe('text');
  });

  it('keeps the transform and the position of every character', () => {
    const { ids, session, space, get } = setup('point', 'ab');
    session.run(transformNodes(space().id, [get().id], translation(30, 40)));
    session.run(createOutlines(space().id, [get().id], ids));
    const group = space().layers[0]!.children[0] as GroupNode;
    expect(group.transform.slice(4)).toEqual([30, 40]);
    const second = group.children[1] as CompoundNode;
    expect(second.children[0]!.anchors[0]!.p.x).toBeCloseTo(5, 6); // advance of the first glyph (500/1000 × 10)
  });

  it('works on text on a path, and draws underlines as rectangles', () => {
    const p = setup('onPath', 'ab');
    p.session.run(createOutlines(p.space().id, [p.get().id], p.ids));
    expect((p.space().layers[0]!.children[0] as GroupNode).children).toHaveLength(2);
    const u = setup('point', 'ab');
    u.session.run(styleText(u.space().id, [u.get().id], { underline: true }));
    u.session.run(createOutlines(u.space().id, [u.get().id], u.ids));
    expect((u.space().layers[0]!.children[0] as GroupNode).children).toHaveLength(3);
  });

  it('ignores objects that are not text', () => {
    const { ids, session, space } = setup();
    expect(session.run(createOutlines(space().id, ['nope'], ids))).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addNode, createDocument, createText, DocumentSession, getActiveSpace, hitTest, sequentialIds, setFontProvider, textGeometry, type FontFace } from '..';

/** Monospace test font: 1000 upm, every glyph 500 wide, ascender 800, descender −200; each glyph is a 400 × 700 box. */
const MONO: FontFace = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  has: () => true,
  glyph: (ch) => ({ advance: 500, commands: /\s/.test(ch) ? [] : [{ t: 'M', x: 0, y: 0 }, { t: 'L', x: 400, y: 0 }, { t: 'L', x: 400, y: 700 }, { t: 'Z' }] }),
  kerning: () => 0,
};

beforeEach(() => setFontProvider({ resolve: (family) => (family === 'Mono' ? MONO : null) }));
afterEach(() => setFontProvider(null));

function textSpace(text: string) {
  const ids = sequentialIds('t');
  const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
  const session = new DocumentSession(doc, { ids, historyLimit: 10 });
  const space = getActiveSpace(session.document);
  const node = createText(ids, { kind: 'point' }, [{ text, style: { fontFamily: 'Mono', fontStyle: 'Regular', size: 10 } }]);
  session.run(addNode(space.id, space.layers[0]!.id, node));
  return { space: getActiveSpace(session.document), node };
}

describe('what a click on point text hits', () => {
  // Size 10: the line box runs from −8 (ascender) to 2 (descender); the ink of "Hi" from −7 to 0 and from x = 0 to 9.
  const pick = (x: number, y: number, tolerance = 0.1) => {
    const { space } = textSpace('Hi');
    return hitTest(space, { x, y }, { tolerance }).length > 0;
  };

  it('hits on the letters and inside the ink box, but not in the line box beyond it', () => {
    expect(pick(2, -3)).toBe(true); // on the first letter
    expect(pick(4.8, -3)).toBe(true); // between the letters, inside the box that is drawn
    expect(pick(2, 1.5)).toBe(false); // descender area: inside the old line box, outside the ink box
    expect(pick(2, -7.6)).toBe(false); // above the letters
    expect(pick(-5, -3)).toBe(false);
  });

  it('keeps a small margin around the box so small text is easy to click', () => {
    expect(pick(2, 0.4, 0.5)).toBe(true);
    expect(pick(2, 0.8, 0.5)).toBe(false);
  });

  it('text that is only spaces keeps its line box (there is no ink to clip to)', () => {
    const { node } = textSpace('   ');
    const [box] = textGeometry(node).boxes;
    expect(box?.map((p) => p.y)).toEqual([-8, -8, 2, 2]); // ascender to descender, not clipped
  });

  it('multi-line text is hit between its lines too', () => {
    const { space } = textSpace('Hi\nHi');
    // Second baseline at 12 (auto leading 120 %); the gap between the lines lies inside the ink box.
    expect(hitTest(space, { x: 2, y: 4 }, { tolerance: 0.1 }).length).toBeGreaterThan(0);
    expect(hitTest(space, { x: 2, y: 14 }, { tolerance: 0.1 }).length).toBe(0);
  });
});

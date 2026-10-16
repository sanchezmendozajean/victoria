import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addNode,
  createDocument,
  createOutlines,
  createText,
  DocumentSession,
  flattenSubPath,
  getActiveSpace,
  sequentialIds,
  setFontProvider,
  textGeometry,
  type Anchor,
  type FontFace,
  type GroupNode,
  type TextNode,
  type TextPath,
  type Vec2,
} from '..';

// Acceptance of Phase 7: text on a path over a circle and a wave. The canvas paints `textGeometry`; Create Outlines
// and (Phase 11) the SVG and PDF exporters take the same geometry, so what matters is that this geometry follows the
// path and that every consumer sees exactly the same outlines. SVG / PDF files themselves are Phase 11.

const MONO: FontFace = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  has: () => true,
  glyph: (ch) => ({ advance: 600, commands: /\s/.test(ch) ? [] : [{ t: 'M', x: 50, y: 0 }, { t: 'L', x: 550, y: 0 }, { t: 'L', x: 550, y: 700 }, { t: 'L', x: 50, y: 700 }, { t: 'Z' }] }),
  kerning: () => 0,
};
beforeEach(() => setFontProvider({ resolve: () => MONO }));
afterEach(() => setFontProvider(null));

const smooth = (p: Vec2, i: Vec2, o: Vec2): Anchor => ({ p, in: i, out: o, kind: 'smooth' });
const K = 0.5522847498;
const R = 100;
const circle: TextPath = {
  closed: true,
  anchors: [
    smooth({ x: R, y: 0 }, { x: R, y: -R * K }, { x: R, y: R * K }),
    smooth({ x: 0, y: R }, { x: R * K, y: R }, { x: -R * K, y: R }),
    smooth({ x: -R, y: 0 }, { x: -R, y: R * K }, { x: -R, y: -R * K }),
    smooth({ x: 0, y: -R }, { x: -R * K, y: -R }, { x: R * K, y: -R }),
  ],
};
const wave: TextPath = {
  closed: false,
  anchors: [
    smooth({ x: 0, y: 0 }, { x: -20, y: 0 }, { x: 40, y: -60 }),
    smooth({ x: 150, y: 0 }, { x: 110, y: 60 }, { x: 190, y: -60 }),
    smooth({ x: 300, y: 0 }, { x: 260, y: 60 }, { x: 340, y: 0 }),
  ],
};

const distanceToPolyline = (p: Vec2, line: readonly Vec2[]): number => {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as Vec2;
    const b = line[i] as Vec2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
};

for (const [name, path] of [['circle', circle], ['wave', wave]] as const) {
  describe(`text on a ${name}`, () => {
    const ids = sequentialIds('p');
    const make = (effect: 'rainbow' | 'skew' | 'stair' = 'rainbow') =>
      createText(ids, { kind: 'onPath', path, options: { effect, align: 'baseline', spacing: 0, flip: false, start: 0, end: 1 } }, [{ text: 'Victoria sobre un trazado', style: { fontFamily: 'Mono', fontStyle: 'Regular', size: 12 } }]);

    it('puts every glyph on the path', () => {
      const node = make();
      const geometry = textGeometry(node);
      expect(geometry.pathGlyphs!.length).toBeGreaterThan(10);
      const line = flattenSubPath({ anchors: path.anchors, closed: path.closed }, 0.01).points;
      const polyline = path.closed ? [...line, line[0] as Vec2] : line;
      for (const { glyph, matrix } of geometry.pathGlyphs!) {
        // The middle of the baseline of each glyph sits on the path.
        const centre = { x: matrix[0] * (glyph.advance / 2) + matrix[4], y: matrix[1] * (glyph.advance / 2) + matrix[5] };
        expect(distanceToPolyline(centre, polyline)).toBeLessThan(0.05);
      }
    });

    it('flipping puts the glyphs on the other side of the path', () => {
      const normal = textGeometry(make());
      const flipped = make();
      flipped.pathOptions!.flip = true;
      const other = textGeometry(flipped);
      const cy = (g: ReturnType<typeof textGeometry>) => g.pathGlyphs!.map((x) => x.matrix[5]);
      expect(cy(other)).not.toEqual(cy(normal));
      expect(other.pathGlyphs!.length).toBeGreaterThan(0);
    });

    it('Create Outlines yields exactly the outlines the canvas paints', () => {
      const node = make();
      const geometry = textGeometry(structuredClone(node));
      const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids, now: '2026-01-01T00:00:00.000Z' });
      const session = new DocumentSession(doc, { ids, historyLimit: 10 });
      const space = () => getActiveSpace(session.document);
      session.run(addNode(space().id, space().layers[0]!.id, node));
      session.run(createOutlines(space().id, [node.id], ids));
      const group = space().layers[0]!.children[0] as GroupNode;
      const outlined: Vec2[] = [];
      for (const child of group.children) {
        const paths = child.type === 'compound' ? child.children : [child];
        for (const p of paths) if (p.type === 'path') for (const a of p.anchors) outlined.push(a.p);
      }
      const painted = geometry.subpaths.flatMap((s) => s.anchors.map((a) => a.p));
      expect(outlined.length).toBe(painted.length);
      for (let i = 0; i < painted.length; i++) {
        expect(outlined[i]!.x).toBeCloseTo(painted[i]!.x, 6);
        expect(outlined[i]!.y).toBeCloseTo(painted[i]!.y, 6);
      }
      void (node as TextNode);
    });
  });
}

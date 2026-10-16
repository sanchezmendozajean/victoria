import { describe, expect, it } from 'vitest';
import { readEps, sequentialIds, type AppearanceItem, type ClipGroupNode, type CompoundNode, type Node, type PathNode } from '..';

const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const read = (s: string) => readEps(bytes(s), sequentialIds('e'));
const fillOf = (n: Node) => n.appearance.items.find((i) => i.kind === 'fill');
const strokeOf = (n: Node) => n.appearance.items.find((i) => i.kind === 'stroke');
const solid = (item: AppearanceItem | undefined) => (item && item.kind !== 'modifier' && item.paint.type === 'solid' ? item.paint.color : null);

const HEADER = '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 10 20 110 220\n%%EndComments\n';

describe('generic PostScript EPS', () => {
  it('reads the bounding box and flips Y into artboard space', () => {
    const r = read(`${HEADER}newpath 10 20 moveto 110 20 lineto 110 220 lineto closepath fill\n`);
    expect([r.width, r.height]).toEqual([100, 200]);
    const p = r.nodes[0] as PathNode;
    expect(p.closed).toBe(true);
    expect(p.anchors.map((a) => [a.p.x, a.p.y])).toEqual([[0, 200], [100, 200], [100, 0]]);
  });

  it('honours the transformation matrix, colours, line width and dashes', () => {
    const r = read(`${HEADER}gsave 10 20 translate 2 2 scale 1 0 0 setrgbcolor 3 setlinewidth [4 2] 0 setdash newpath 0 0 moveto 10 0 lineto stroke grestore\n`);
    const n = r.nodes[0] as PathNode;
    expect(n.anchors[1]!.p.x).toBeCloseTo(20);
    const s = strokeOf(n)!;
    expect(s.kind === 'stroke' && s.stroke.width).toBe(6);
    expect(s.kind === 'stroke' && s.stroke.dash).toEqual([8, 4]);
    expect(solid(s)?.values).toEqual([255, 0, 0]);
  });

  it('runs procedures defined in the prolog (as Cairo and Inkscape write them)', () => {
    const r = read(
      `${HEADER}/m { moveto } bind def /l { lineto } bind def /f { fill } bind def\n/box { 4 dict begin /h exch def /w exch def /y exch def /x exch def newpath x y m x w add y l x w add y h add l closepath f end } def\n0.5 setgray 20 30 40 50 box\n`,
    );
    const n = r.nodes[0] as PathNode;
    expect(n.anchors).toHaveLength(3);
    expect(solid(fillOf(n))).toEqual({ model: 'gray', values: [50] });
  });

  it('makes a compound path from several subpaths and uses the even-odd rule for eofill', () => {
    const r = read(`${HEADER}newpath 10 20 moveto 60 20 lineto 60 70 lineto closepath 20 30 moveto 30 30 lineto 30 40 lineto closepath eofill\n`);
    const c = r.nodes[0] as CompoundNode;
    expect(c.type).toBe('compound');
    expect(c.children).toHaveLength(2);
    expect(c.fillRule).toBe('evenodd');
  });

  it('clip opens a clip group that closes with grestore', () => {
    const r = read(
      `${HEADER}gsave newpath 10 20 moveto 60 20 lineto 60 70 lineto closepath clip newpath 0 0 moveto 100 0 lineto 100 100 lineto fill grestore newpath 10 20 moveto 20 20 lineto 20 30 lineto fill\n`,
    );
    expect(r.nodes).toHaveLength(2);
    const g = r.nodes[0] as ClipGroupNode;
    expect(g.type).toBe('clipGroup');
    expect(g.children).toHaveLength(2);
    expect(r.nodes[1]!.type).toBe('path');
  });

  it('loops and arithmetic work', () => {
    const r = read(`${HEADER}0 1 2 { 20 mul 10 add dup 20 moveto 5 add 20 lineto 0 setgray stroke } for\n`);
    expect(r.nodes).toHaveLength(3);
  });

  it('skips text and images and says so', () => {
    const text = read(`${HEADER}newpath 10 20 moveto 50 20 lineto 50 50 lineto fill /Helvetica findfont 12 scalefont setfont 10 10 moveto (Hi) show\n`);
    expect(text.nodes).toHaveLength(1);
    expect(text.warnings.map((w) => w.code)).toContain('text');
    const image = read(`${HEADER}newpath 10 20 moveto 50 20 lineto 50 50 lineto fill 8 8 8 [1 0 0 1 0 0] currentfile image\nFFFF00\n`);
    expect(image.nodes).toHaveLength(1);
    expect(image.warnings.map((w) => w.code)).toContain('image');
  });

  it('rejects files that are not EPS', () => {
    expect(() => read('hello')).toThrow();
    expect(() => read('%!PS-Adobe-3.0\nnewpath')).toThrow(/bounding box/);
  });

  it('reads the PostScript section of a DOS EPS binary', () => {
    const ps = `${HEADER}newpath 10 20 moveto 50 20 lineto 50 50 lineto fill\n`;
    const head = new Uint8Array(30);
    head.set([0xc5, 0xd0, 0xd3, 0xc6]);
    new DataView(head.buffer).setUint32(4, 30, true);
    new DataView(head.buffer).setUint32(8, ps.length, true);
    const all = new Uint8Array([...head, ...bytes(ps), 0, 0, 0]);
    expect(readEps(all, sequentialIds('e')).nodes).toHaveLength(1);
  });

  it('stops runaway programs and keeps what was drawn', () => {
    const r = read(`${HEADER}newpath 10 20 moveto 50 20 lineto 50 50 lineto fill /x { x } def x\n`);
    expect(r.nodes).toHaveLength(1);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

const AI = [
  '%!PS-Adobe-3.0 EPSF-3.0',
  '%%Creator: Adobe Illustrator(R) 8.0',
  '%%BoundingBox: 0 0 200 100',
  '%%EndComments',
  '%%BeginProlog',
  '/m {moveto} def',
  '%%EndProlog',
  '%%BeginSetup',
  '%%EndSetup',
  '%AI5_BeginLayer',
  '1 1 1 1 0 0 0 79 128 255 Lb',
  '(Layer 1) Ln',
  '0 A',
  'u',
  '0 0 0 1 k',
  '0 J 0 j 2 w 4 M []0 d',
  '0 D',
  '10 10 m',
  '90 10 l',
  '90 60 L',
  '60 90 90 90 90 60 c',
  '30 80 10 60 v',
  'h',
  'f',
  'U',
  '0 0 1 0 (PANTONE Yellow) 0 X',
  '0 1 1 0 K',
  '100 50 m',
  '150 50 150 90 120 90 c',
  'S',
  '*u',
  '0 g',
  '20 20 m',
  '40 20 l',
  '40 40 l',
  'n',
  '25 25 m',
  '30 25 l',
  '30 30 l',
  'f',
  '*U',
  'LB',
  '%AI5_EndLayer',
  '%%Trailer',
  '%%EOF',
  '',
].join('\n');

describe('Illustrator EPS', () => {
  it('reads groups, compact operators, colours and compound paths', () => {
    const r = read(AI);
    expect([r.width, r.height]).toEqual([200, 100]);
    expect(r.nodes.map((n) => n.type)).toEqual(['group', 'path', 'compound']);
    const group = r.nodes[0] as unknown as { children: PathNode[] };
    const shape = group.children[0]!;
    expect(shape.closed).toBe(true);
    expect(shape.anchors).toHaveLength(5);
    expect(shape.anchors[0]!.p).toEqual({ x: 10, y: 90 }); // Y flipped
    expect(solid(fillOf(shape))).toEqual({ model: 'cmyk', values: [0, 0, 0, 100] });
    const curve = r.nodes[1] as PathNode;
    expect(solid(strokeOf(curve))).toEqual({ model: 'cmyk', values: [0, 100, 100, 0] });
    expect(curve.anchors[0]!.out).toEqual({ x: 150, y: 50 });
    expect((r.nodes[2] as CompoundNode).children).toHaveLength(2);
  });

  it('reports gradients as unsupported instead of failing', () => {
    const r = read(AI.replace('%AI5_BeginLayer', '%AI5_BeginGradient: (G)\n0 0 0 1 0 0 0 0 0 0 Bd\n%AI5_EndGradient\n%AI5_BeginLayer'));
    expect(r.warnings.map((w) => w.code)).toContain('gradient');
    expect(r.nodes).toHaveLength(3);
  });
});

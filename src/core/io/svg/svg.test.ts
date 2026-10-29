import { describe, expect, it } from 'vitest';
import {
  addGradient,
  addNode,
  applyToPoint,
  buildScene,
  createDocument,
  createEllipse,
  createRect,
  defaultStroke,
  DocumentSession,
  geometryBounds,
  getActiveSpace,
  importSvg,
  nodeGeometry,
  sequentialIds,
  setNodeAppearance,
  toBase64,
  writeSvg,
  multiply,
  type CompoundNode,
  type Matrix,
  type ClipGroupNode,
  type GroupNode,
  type Node,
  type PathNode,
  type ShapeNode,
  type TextNode,
  type ImageNode,
} from '../..';
import { parsePathData } from './pathData';
import { parseColor, parseStylesheet, parseTransform, toUserUnits } from './style';
import { parseXml, XmlError } from './xml';

const ids = () => sequentialIds('s');
const svg = (body: string, attrs = 'width="200" height="100"') => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}>${body}</svg>`;
const near = (a: number, b: number, digits = 3) => expect(a).toBeCloseTo(b, digits);

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 218, 99, 252, 207, 192, 80, 15, 0, 4, 133, 1, 128, 132, 169, 140, 33, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

const fillOf = (n: Node) => n.appearance.items.find((i) => i.kind === 'fill');
const strokeOf = (n: Node) => n.appearance.items.find((i) => i.kind === 'stroke');
const solidRgb = (n: Node) => {
  const f = fillOf(n);
  return f && f.paint.type === 'solid' ? f.paint.color.values : null;
};

describe('XML reader', () => {
  it('reads nesting, attributes, entities, CDATA, comments and the prolog', () => {
    const root = parseXml('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><!-- hi --><svg a="1 &amp; 2" b=\'&#65;&#x42;\'><g id="g"><t>a &lt; b<![CDATA[<raw>]]></t></g><e/></svg>');
    expect(root.name).toBe('svg');
    expect(root.attrs).toEqual({ a: '1 & 2', b: 'AB' });
    const g = root.children[0] as ReturnType<typeof parseXml>;
    expect(g.attrs.id).toBe('g');
    expect(((g.children[0] as ReturnType<typeof parseXml>).children as string[]).join('')).toBe('a < b<raw>');
    expect((root.children[1] as ReturnType<typeof parseXml>).name).toBe('e');
  });

  it('refuses what is not well formed', () => {
    for (const bad of ['<svg><g></svg>', '<svg', '<svg a=1/>', '', '<a/><b/>', '<svg></g></svg>', '<svg><!-- x </svg>']) expect(() => parseXml(bad)).toThrow(XmlError);
  });
});

describe('path data', () => {
  it('reads absolute and relative lines, implicit linetos and closing', () => {
    const { contours, error } = parsePathData('M10 10 20 10 l0 20 H5 v-5 z');
    expect(error).toBe(false);
    expect(contours).toHaveLength(1);
    expect(contours[0]!.anchors.map((a) => [a.p.x, a.p.y])).toEqual([[10, 10], [20, 10], [20, 30], [5, 30], [5, 25]]);
    expect(contours[0]!.closed).toBe(true);
  });

  it('keeps cubic handles on the anchors and marks collinear ones as smooth', () => {
    const { contours } = parsePathData('M0 0 C0 10 10 20 20 20 S40 10 40 0');
    const [a, b, c] = contours[0]!.anchors;
    expect(a!.out).toEqual({ x: 0, y: 10 });
    expect(b!.in).toEqual({ x: 10, y: 20 });
    expect(b!.out).toEqual({ x: 30, y: 20 }); // reflected
    expect(b!.kind).toBe('smooth');
    expect(c!.in).toEqual({ x: 40, y: 10 });
    expect(a!.kind).toBe('corner');
  });

  it('turns quadratics into cubics that pass through the same points', () => {
    const { contours } = parsePathData('M0 0 Q50 100 100 0');
    const [a, b] = contours[0]!.anchors;
    near(a!.out!.x, 100 / 3);
    near(a!.out!.y, 200 / 3);
    near(b!.in!.x, 200 / 3);
  });

  it('turns arcs into at most quarter-turn cubics ending exactly at the endpoint', () => {
    const { contours } = parsePathData('M0 0 A50 50 0 1 1 100 0');
    const anchors = contours[0]!.anchors;
    expect(anchors.length).toBe(3); // a half circle: two quarter arcs
    expect(anchors[anchors.length - 1]!.p).toEqual({ x: 100, y: 0 });
    // The middle anchor of a half circle of radius 50 centred at (50, 0) is 50 away from the centre.
    near(Math.hypot(anchors[1]!.p.x - 50, anchors[1]!.p.y), 50);
  });

  it('reads numbers as they are written in the wild: 1.5.5, -1-2, exponents, compact arc flags', () => {
    const a = parsePathData('M1.5.5-1-2L1e1,2E-1').contours[0]!.anchors.map((p) => [p.p.x, p.p.y]);
    expect(a).toEqual([[1.5, 0.5], [-1, -2], [10, 0.2]]);
    const arc = parsePathData('M0 0a10 10 0 00 20 0').contours[0]!.anchors;
    expect(arc[arc.length - 1]!.p).toEqual({ x: 20, y: 0 });
  });

  it('returns what it could read before an error, and says there was one', () => {
    const r = parsePathData('M0 0 L10 10 L 20');
    expect(r.error).toBe(true);
    expect(r.contours[0]!.anchors).toHaveLength(2);
    expect(parsePathData('L10 10').error).toBe(true);
  });

  it('starts a new contour at the same point after a close, and merges a point that closes onto the start', () => {
    const { contours } = parsePathData('M0 0 L10 0 L10 10 L0 0 Z L5 5');
    expect(contours).toHaveLength(2);
    expect(contours[0]!.anchors).toHaveLength(3);
    expect(contours[1]!.anchors[0]!.p).toEqual({ x: 0, y: 0 });
  });
});

describe('colours, units, transforms and CSS', () => {
  it('parses the colour notations', () => {
    expect(parseColor('#f80')).toEqual({ rgb: [255, 136, 0], alpha: 1 });
    expect(parseColor('#11223380')).toMatchObject({ rgb: [17, 34, 51] });
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ rgb: [10, 20, 30], alpha: 1 });
    expect(parseColor('rgba(100%, 0%, 0%, 0.5)')).toEqual({ rgb: [255, 0, 0], alpha: 0.5 });
    expect(parseColor('hsl(120 100% 25%)')).toEqual({ rgb: [0, 128, 0], alpha: 1 });
    expect(parseColor('CornflowerBlue')).toEqual({ rgb: [100, 149, 237], alpha: 1 });
    expect(parseColor('none')).toBe('none');
    expect(parseColor('currentColor')).toBe('currentColor');
    expect(parseColor('url(#g)')).toBeNull();
    expect(parseColor('blorange')).toBeNull();
  });

  it('converts lengths to user units', () => {
    expect(toUserUnits('10', 0)).toBe(10);
    expect(toUserUnits('1in', 0)).toBe(96);
    near(toUserUnits('25.4mm', 0)!, 96);
    expect(toUserUnits('50%', 200)).toBe(100);
    expect(toUserUnits('2em', 0, 10)).toBe(20);
    expect(toUserUnits('abc', 0)).toBeNull();
  });

  it('composes transform lists left to right', () => {
    const m = parseTransform('translate(10 20) scale(2)')!;
    expect(applyToPoint(m, { x: 1, y: 1 })).toEqual({ x: 12, y: 22 });
    const r = parseTransform('rotate(90 10 10)')!;
    const p = applyToPoint(r, { x: 20, y: 10 });
    near(p.x, 10);
    near(p.y, 20);
    expect(parseTransform('translate(1')).toBeNull();
    expect(parseTransform('wobble(1)')).toBeNull();
  });

  it('reads simple selectors and skips the rest', () => {
    const { rules, skipped } = parseStylesheet('.a, #b {fill:red} rect.c{stroke:blue;} g > path {fill:green} @media print { .a { fill: x } }');
    expect(rules.map((r) => r.specificity)).toEqual([10, 100, 11]);
    expect(skipped).toBe(1);
  });
});

describe('importSvg · size and shapes', () => {
  it('uses width and height as pt for px and unitless sizes, and converts physical units', () => {
    expect(importSvg(svg(''), ids())).toMatchObject({ width: 200, height: 100 });
    const mm = importSvg(svg('', 'width="210mm" height="297mm" viewBox="0 0 210 297"'), ids());
    near(mm.width, 595.276, 2);
    near(mm.height, 841.89, 2);
    const withBox = importSvg(svg('<rect width="210" height="297"/>', 'width="210mm" height="297mm" viewBox="0 0 210 297"'), ids());
    near(withBox.nodes[0]!.transform[0], 595.276 / 210, 4);
  });

  it('falls back to the viewBox, then to 100 × 100', () => {
    expect(importSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 24"/>', ids())).toMatchObject({ width: 48, height: 24 });
    expect(importSvg('<svg xmlns="http://www.w3.org/2000/svg"/>', ids())).toMatchObject({ width: 100, height: 100 });
  });

  it('centres a viewBox of another shape inside the artboard, without distortion', () => {
    const r = importSvg(svg('<rect x="0" y="0" width="10" height="10"/>', 'width="200" height="100" viewBox="0 0 10 10"'), ids());
    expect(r.nodes[0]!.transform).toEqual([10, 0, 0, 10, 50, 0]);
  });

  it('keeps plain rectangles, circles and ellipses as live shapes at the right place', () => {
    const r = importSvg(svg('<rect x="10" y="20" width="30" height="40" fill="#f00" stroke="#000" stroke-width="2"/><circle cx="100" cy="50" r="20" fill="blue"/><ellipse cx="50" cy="50" rx="10" ry="5"/>'), ids());
    const [rect, circle, ellipse] = r.nodes as ShapeNode[];
    expect(rect!.shape).toBe('rect');
    expect(rect!.params).toMatchObject({ w: 30, h: 40 });
    expect(rect!.transform).toEqual([1, 0, 0, 1, 10, 20]);
    expect(solidRgb(rect!)).toEqual([255, 0, 0]);
    expect(strokeOf(rect!)).toMatchObject({ kind: 'stroke', stroke: { width: 2 } });
    expect(circle!.shape).toBe('ellipse');
    expect(circle!.params).toMatchObject({ w: 40, h: 40 });
    expect(circle!.transform).toEqual([1, 0, 0, 1, 80, 30]);
    expect(ellipse!.params).toMatchObject({ w: 20, h: 10 });
  });

  it('a rectangle with equal rx and ry is a live rounded rectangle; with different radii it is a path', () => {
    const r = importSvg(svg('<rect width="100" height="50" rx="10"/><rect width="100" height="50" rx="10" ry="5"/>'), ids());
    const [round, odd] = r.nodes;
    expect(round!.type).toBe('shape');
    expect((round as ShapeNode).params).toMatchObject({ radii: [10, 10, 10, 10] });
    expect(odd!.type).toBe('path');
    const b = geometryBounds(nodeGeometry(odd!)!)!;
    near(b.maxX - b.minX, 100);
    near(b.maxY - b.minY, 50);
  });

  it('builds paths, compound paths with their fill rule, lines and polygons', () => {
    const r = importSvg(svg('<path d="M0 0H10V10Z"/><path d="M0 0H10V10ZM2 2H4V4Z" fill-rule="evenodd"/><line x1="0" y1="0" x2="10" y2="10" stroke="red"/><polygon points="0,0 10,0 5,8"/><polyline points="0,0 10,0 5,8" fill="none" stroke="black"/>'), ids());
    expect(r.nodes.map((n) => n.type)).toEqual(['path', 'compound', 'path', 'path', 'path']);
    expect((r.nodes[1] as CompoundNode).fillRule).toBe('evenodd');
    expect((r.nodes[1] as CompoundNode).children).toHaveLength(2);
    expect((r.nodes[3] as PathNode).closed).toBe(true);
    expect((r.nodes[4] as PathNode).closed).toBe(false);
  });

  it('puts the element transform on the object', () => {
    const r = importSvg(svg('<g transform="translate(10 10)"><path d="M0 0H10V10Z" transform="scale(2)"/></g>'), ids());
    const g = r.nodes[0] as GroupNode;
    expect(g.type).toBe('group');
    expect(g.transform).toEqual([1, 0, 0, 1, 10, 10]);
    expect(g.children[0]!.transform).toEqual([2, 0, 0, 2, 0, 0]);
  });
});

describe('importSvg · style', () => {
  it('cascades presentation attributes, <style> rules and inline style, and inherits from groups', () => {
    const r = importSvg(
      svg('<style>.k{fill:#00ff00} #w{fill:#0000ff}</style><g fill="#ff0000" stroke="#000" stroke-width="3"><rect class="k" width="1" height="1"/><rect id="w" class="k" width="1" height="1"/><rect class="k" style="fill:#ffff00" width="1" height="1"/><rect width="1" height="1"/></g>'),
      ids(),
    );
    const rects = (r.nodes[0] as GroupNode).children;
    expect(rects.map(solidRgb)).toEqual([[0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 0]]);
    expect(strokeOf(rects[3]!)).toMatchObject({ stroke: { width: 3 } });
  });

  it('defaults to a black fill without stroke, and drops objects that paint nothing or are display:none', () => {
    const r = importSvg(svg('<rect width="1" height="1"/><rect width="1" height="1" fill="none"/><rect width="1" height="1" style="display:none"/><rect width="1" height="1" fill="none" stroke="red" stroke-width="0"/>'), ids());
    expect(r.nodes).toHaveLength(1);
    expect(solidRgb(r.nodes[0]!)).toEqual([0, 0, 0]);
    expect(strokeOf(r.nodes[0]!)).toBeUndefined();
  });

  it('reads stroke caps, joins, miter limit and dashes (odd lists repeat)', () => {
    const r = importSvg(svg('<path d="M0 0L10 10" fill="none" stroke="red" stroke-linecap="round" stroke-linejoin="bevel" stroke-miterlimit="7" stroke-dasharray="4 2 1"/>'), ids());
    expect(strokeOf(r.nodes[0]!)).toMatchObject({ stroke: { cap: 'round', join: 'bevel', miterLimit: 7, dash: [4, 2, 1, 4, 2, 1] } });
  });

  it('turns opacity into object opacity and fill/stroke opacity into the item opacity (with the colour alpha)', () => {
    const r = importSvg(svg('<rect width="1" height="1" opacity=".5" fill="rgba(255,0,0,0.5)" fill-opacity=".5" style="mix-blend-mode:multiply"/>'), ids());
    expect(r.nodes[0]!.opacity).toBe(0.5);
    expect(r.nodes[0]!.blendMode).toBe('multiply');
    expect(fillOf(r.nodes[0]!)!.opacity).toBeCloseTo(0.25, 6);
  });

  it('currentColor takes the colour property of the element or its parents', () => {
    const r = importSvg(svg('<g color="#102030"><rect width="1" height="1" fill="currentColor"/></g>'), ids());
    expect(solidRgb((r.nodes[0] as GroupNode).children[0]!)).toEqual([16, 32, 48]);
  });
});

describe('importSvg · gradients, clipping, use, images and text', () => {
  it('maps a bounding-box linear gradient onto the object, following href for stops', () => {
    const r = importSvg(
      svg('<defs><linearGradient id="a"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f" stop-opacity=".5"/></linearGradient><linearGradient id="b" xlink:href="#a" x1="0" y1="0" x2="0" y2="1"/></defs><rect x="10" y="20" width="100" height="50" fill="url(#b)"/>'),
      ids(),
    );
    expect(r.gradients).toHaveLength(1);
    expect(r.gradients[0]!.stops).toMatchObject([{ offset: 0, opacity: 1 }, { offset: 1, opacity: 0.5 }]);
    const fill = fillOf(r.nodes[0]!)!;
    expect(fill.paint.type).toBe('linear');
    if (fill.paint.type !== 'linear') return;
    // The gradient axis runs from the top to the bottom of the rectangle (in its own space: (0,0) to (0,50)).
    expect(applyToPoint(fill.paint.transform, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    const end = applyToPoint(fill.paint.transform, { x: 1, y: 0 });
    near(end.x, 0);
    near(end.y, 50);
  });

  it('maps a user-space radial gradient to its centre and radius, and warns about a focal point', () => {
    const r = importSvg(
      svg('<defs><radialGradient id="r" gradientUnits="userSpaceOnUse" cx="50" cy="40" r="20" fx="55"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient></defs><circle cx="50" cy="40" r="30" fill="url(#r)"/>'),
      ids(),
    );
    const fill = fillOf(r.nodes[0]!)!;
    expect(fill.paint.type).toBe('radial');
    if (fill.paint.type !== 'radial') return;
    // The circle node is placed at (20, 10): the gradient is expressed in the circle's own space.
    expect(applyToPoint(fill.paint.transform, { x: 0, y: 0 })).toEqual({ x: 50, y: 40 });
    expect(r.warnings.map((w) => w.code)).toContain('gradient');
  });

  it('a gradient with one stop is a plain colour and a missing one is dropped with a warning', () => {
    const r = importSvg(svg('<defs><linearGradient id="one"><stop offset="0" stop-color="#0f0"/></linearGradient></defs><rect width="9" height="9" fill="url(#one)"/><rect width="9" height="9" fill="url(#nope)"/>'), ids());
    expect(solidRgb(r.nodes[0]!)).toEqual([0, 255, 0]);
    expect(r.nodes).toHaveLength(1);
    expect(r.warnings.map((w) => w.code)).toContain('gradient');
  });

  it('a clip path becomes a clipping group whose first child is the mask', () => {
    const r = importSvg(svg('<defs><clipPath id="c"><rect x="0" y="0" width="10" height="10"/><circle cx="30" cy="5" r="5"/></clipPath></defs><rect width="100" height="100" transform="translate(5 5)" clip-path="url(#c)"/>'), ids());
    const clip = r.nodes[0] as ClipGroupNode;
    expect(clip.type).toBe('clipGroup');
    expect(clip.transform).toEqual([1, 0, 0, 1, 5, 5]);
    const [mask, content] = clip.children;
    expect(mask!.type).toBe('compound');
    expect((mask as CompoundNode).children).toHaveLength(2);
    expect(content!.transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('instantiates <use> with its offset, and survives a reference to itself', () => {
    const r = importSvg(svg('<defs><rect id="sq" width="10" height="10" fill="red"/><g id="loop"><use xlink:href="#loop"/></g></defs><use xlink:href="#sq" x="30" y="40"/><use href="#loop"/>'), ids());
    const g = r.nodes[0] as GroupNode;
    expect(g.transform).toEqual([1, 0, 0, 1, 30, 40]);
    expect(g.children[0]!.type).toBe('shape');
    expect(r.warnings.map((w) => w.code)).toContain('use');
  });

  it('embeds a data: image, deduplicated, and warns about external files', () => {
    const uri = `data:image/png;base64,${toBase64(PNG)}`;
    const r = importSvg(svg(`<image href="${uri}" x="10" y="20" width="40" height="20"/><image xlink:href="${uri}" width="8" height="8"/><image href="photo.jpg" width="5" height="5"/>`), ids());
    const [a, b] = r.nodes as ImageNode[];
    expect(Object.keys(r.images)).toHaveLength(1);
    expect(a!.resourceId).toBe(b!.resourceId);
    expect(r.images[a!.resourceId]!.resource).toEqual({ width: 1, height: 1, format: 'png' });
    // A 1×1 picture in a 40×20 box keeps its shape, centred.
    expect(a).toMatchObject({ width: 20, height: 20 });
    expect(a!.transform).toEqual([1, 0, 0, 1, 20, 20]);
    expect(r.warnings.map((w) => w.code)).toContain('external-image');
  });

  it('imports simple text as point text at its baseline, with font, size, weight and anchor', () => {
    const r = importSvg(svg('<text x="50" y="30" font-family="\'Open Sans\', sans-serif" font-size="12" font-weight="bold" text-anchor="middle" fill="#123456">Hola <tspan font-style="italic">mundo</tspan></text>'), ids());
    const t = r.nodes[0] as TextNode;
    expect(t.type).toBe('text');
    expect(t.kind).toBe('point');
    expect(t.transform).toEqual([1, 0, 0, 1, 50, 30]);
    expect(t.story.map((s) => s.text).join('')).toBe('Hola mundo');
    expect(t.story[0]!.style).toMatchObject({ fontFamily: 'Open Sans', fontStyle: 'Bold', size: 12 });
    expect(t.story[1]!.style.fontStyle).toBe('Bold Italic');
    expect(t.paragraphs?.[0]).toEqual({ align: 'center' });
    expect(solidRgb(t)).toEqual([18, 52, 86]);
  });

  it('reports what it leaves out instead of failing', () => {
    const r = importSvg(
      svg('<defs><pattern id="p" width="2" height="2"><rect width="1" height="1"/></pattern></defs><rect width="9" height="9" fill="url(#p)" filter="url(#f)" mask="url(#m)"/><text><textPath href="#x">abc</textPath></text><foo/>'),
      ids(),
    );
    const codes = r.warnings.map((w) => w.code);
    for (const code of ['pattern', 'filter', 'mask', 'text-path', 'element'] as const) expect(codes).toContain(code);
  });

  it('refuses files that are not SVG', () => {
    expect(() => importSvg('<html/>', ids())).toThrow(/not an SVG/);
    expect(() => importSvg('not xml', ids())).toThrow();
  });
});

describe('importSvg · round trip with the exporter', () => {
  it('reads back what writeSvg wrote: same shapes in the same places with the same colours', () => {
    const sid = sequentialIds('r');
    const doc = createDocument({ name: 'T', spaceName: 'S', artboardName: 'B', layerName: 'L', ids: sid, now: '2026-01-01T00:00:00.000Z' });
    const session = new DocumentSession(doc, { ids: sid });
    const space = () => getActiveSpace(session.document);
    const add = <T extends Node>(n: T): T => {
      session.run(addNode(space().id, space().layers[0]!.id, n));
      return n;
    };
    const red = { model: 'rgb' as const, values: [255, 0, 0] };
    const blue = { model: 'rgb' as const, values: [0, 0, 255] };
    const a0 = createRect(sid, 80, 40, 6);
    a0.transform = [1, 0, 0, 1, 20, 30];
    const a = add(a0);
    session.run(setNodeAppearance(space().id, a.id, { items: [{ kind: 'fill', paint: { type: 'solid', color: red }, opacity: 1, modifiers: [] }, { kind: 'stroke', paint: { type: 'solid', color: blue }, stroke: { ...defaultStroke(), width: 3, dash: [4, 2] }, opacity: 0.5, modifiers: [] }] }));
    const b0 = createEllipse(sid, 50, 30);
    b0.transform = [1, 0, 0, 1, 150, 40];
    const b = add(b0);
    session.run(addGradient({ id: 'g1', name: 'G', type: 'linear', stops: [{ offset: 0, color: red, opacity: 1 }, { offset: 1, color: blue, opacity: 1 }] }));
    session.run(setNodeAppearance(space().id, b.id, { items: [{ kind: 'fill', paint: { type: 'linear', gradientId: 'g1', transform: [50, 0, 0, 30, 0, 0] }, opacity: 1, modifiers: [] }] }));

    const scene = buildScene(space(), { resources: session.document.resources, region: { minX: 0, minY: 0, maxX: 240, maxY: 120 } });
    const text = writeSvg(scene, session.images).svg;
    const back = importSvg(text, sequentialIds('b'));
    expect(back).toMatchObject({ width: 240, height: 120 });
    expect(back.gradients).toHaveLength(1);

    // The exporter wraps each object in a group that carries its transform: compose it back.
    const world = (n: Node, parent: Matrix): number[] => {
      const m = multiply(parent, n.transform);
      const box = geometryBounds(nodeGeometry(n)!)!;
      const p = applyToPoint(m, { x: box.minX, y: box.minY });
      const q = applyToPoint(m, { x: box.maxX, y: box.maxY });
      return [Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)];
    };
    const flat = back.nodes.flatMap((n) => (n.type === 'group' ? n.children.map((c) => ({ node: c, parent: n.transform })) : [{ node: n, parent: [1, 0, 0, 1, 0, 0] as Matrix }]));
    const expected = [a, b].map((n) => world(n, [1, 0, 0, 1, 0, 0]));
    flat.slice(0, 2).forEach((entry, i) => world(entry.node, entry.parent).forEach((v, k) => near(v, expected[i]![k]!, 1)));
    expect(solidRgb(flat[0]!.node)).toEqual([255, 0, 0]);
    expect(strokeOf(flat[0]!.node)).toMatchObject({ stroke: { width: 3, dash: [4, 2] }, opacity: 0.5 });
    expect(fillOf(flat[1]!.node)!.paint.type).toBe('linear');
  });
});

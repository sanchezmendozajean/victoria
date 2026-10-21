import { describe, expect, it } from 'vitest';
import { boundsOfGeometry } from './util';
import { defaultParams, getModifier, listModifiers } from './registry';
import type { Geometry, ModifierContext, Params } from './types';

const corner = (x: number, y: number) => ({ p: { x, y }, in: null, out: null, kind: 'corner' as const });
const square: Geometry = { fillRule: 'nonzero', subpaths: [{ closed: true, anchors: [corner(0, 0), corner(100, 0), corner(100, 100), corner(0, 100)] }] };
const line: Geometry = { fillRule: 'nonzero', subpaths: [{ closed: false, anchors: [corner(0, 0), corner(100, 0)] }] };
const K = 0.5522847498 * 50;
const circle: Geometry = {
  fillRule: 'nonzero',
  subpaths: [
    {
      closed: true,
      anchors: [
        { p: { x: 100, y: 50 }, in: { x: 100, y: 50 - K }, out: { x: 100, y: 50 + K }, kind: 'smooth' },
        { p: { x: 50, y: 100 }, in: { x: 50 + K, y: 100 }, out: { x: 50 - K, y: 100 }, kind: 'smooth' },
        { p: { x: 0, y: 50 }, in: { x: 0, y: 50 + K }, out: { x: 0, y: 50 - K }, kind: 'smooth' },
        { p: { x: 50, y: 0 }, in: { x: 50 - K, y: 0 }, out: { x: 50 + K, y: 0 }, kind: 'smooth' },
      ],
    },
  ],
};

const ctx: ModifierContext = { bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, stroke: { width: 10, cap: 'butt', join: 'miter', miterLimit: 4 } };
const r = (n: number) => Math.round(n * 1000) / 1000;

/** A stable text form of a geometry for snapshots: rounded coordinates, handles and kinds. */
function describe_(g: Geometry | undefined): string {
  if (!g) return 'none';
  return g.subpaths
    .map((s) => `${s.closed ? 'closed' : 'open'}: ${s.anchors.map((a) => `${a.kind[0]}(${r(a.p.x)},${r(a.p.y)}${a.in ? ` <${r(a.in.x)},${r(a.in.y)}` : ''}${a.out ? ` >${r(a.out.x)},${r(a.out.y)}` : ''})`).join(' ')}`)
    .join('\n') + `\n[${g.fillRule}]`;
}

function run(id: string, params: Params = {}, input: Geometry = square, c: ModifierContext = ctx) {
  const def = getModifier(id)!;
  return def.apply(input, { ...defaultParams(id), ...params }, c);
}

describe('modifier registry', () => {
  it('lists the v1 catalog with a schema and defaults for every entry', () => {
    const ids = listModifiers().map((m) => m.id);
    for (const id of ['offset-path', 'outline-stroke', 'pf-unite', 'pf-minus-front', 'pf-intersect', 'pf-exclude', 'round-corners', 'zigzag', 'pucker-bloat', 'roughen', 'transform', 'warp-arc', 'warp-flag', 'warp-wave', 'warp-inflate', 'drop-shadow', 'outer-glow']) {
      expect(ids).toContain(id);
    }
    for (const def of listModifiers()) {
      for (const field of def.schema) expect(def.defaults[field.key]).not.toBeUndefined();
    }
  });

  it('only the appearance modifiers leave the geometry alone', () => {
    expect(listModifiers().filter((m) => !m.affectsGeometry).map((m) => m.id)).toEqual(['drop-shadow', 'outer-glow']);
  });
});

describe('structural modifiers (geometry snapshots)', () => {
  it('round-corners rounds the four corners of a square', () => {
    const out = run('round-corners', { radius: 20 }).geometry!;
    expect(out.subpaths[0]!.anchors).toHaveLength(8);
    expect(describe_(out)).toMatchSnapshot();
  });

  it('zigzag adds alternating ridges on every span, keeping the original anchors', () => {
    const out = run('zigzag', { size: 5, ridges: 2 }, line).geometry!;
    const pts = out.subpaths[0]!.anchors.map((a) => a.p);
    expect(pts).toHaveLength(4); // 2 anchors + 2 ridges
    expect(pts[1]!.y).toBeCloseTo(5);
    expect(pts[2]!.y).toBeCloseTo(-5);
    expect(describe_(out)).toMatchSnapshot();
  });

  it('zigzag with smooth points gives handles', () => {
    const out = run('zigzag', { size: 5, ridges: 3, points: 'smooth' }, line).geometry!;
    expect(out.subpaths[0]!.anchors.some((a) => a.in || a.out)).toBe(true);
  });

  it('pucker-bloat: a bloated square keeps its centre and bulges its sides (handles appear)', () => {
    const out = run('pucker-bloat', { amount: 50 }).geometry!;
    const b = boundsOfGeometry(out)!;
    expect((b.minX + b.maxX) / 2).toBeCloseTo(50);
    expect(out.subpaths[0]!.anchors.every((a) => a.in && a.out)).toBe(true);
    expect(describe_(out)).toMatchSnapshot();
    // Zero amount is the identity.
    expect(run('pucker-bloat', { amount: 0 }).geometry).toBe(square);
  });

  it('roughen is deterministic for a seed and different for another', () => {
    const a = describe_(run('roughen', { size: 4, detail: 10, seed: 7 }).geometry);
    expect(describe_(run('roughen', { size: 4, detail: 10, seed: 7 }).geometry)).toBe(a);
    expect(describe_(run('roughen', { size: 4, detail: 10, seed: 8 }).geometry)).not.toBe(a);
    expect(a).toMatchSnapshot();
  });

  it('transform scales, moves and rotates about the centre; copies add contours', () => {
    const scaled = run('transform', { scaleX: 50, scaleY: 50, moveX: 10 }).geometry!;
    const b = boundsOfGeometry(scaled)!;
    expect([r(b.minX), r(b.maxX), r(b.minY), r(b.maxY)]).toEqual([35, 85, 25, 75]);
    const copies = run('transform', { moveX: 120, copies: 2 }).geometry!;
    expect(copies.subpaths).toHaveLength(3);
    expect(boundsOfGeometry(copies)!.maxX).toBeCloseTo(340);
    expect(describe_(scaled)).toMatchSnapshot();
  });

  for (const id of ['warp-arc', 'warp-flag', 'warp-wave', 'warp-inflate']) {
    it(`${id} bends the object and keeps it a closed Bézier contour`, () => {
      const out = run(id, { bend: 50 }, circle).geometry!;
      expect(out.subpaths[0]!.closed).toBe(true);
      expect(out.subpaths[0]!.anchors.length).toBeGreaterThan(4); // spans were split to bend smoothly
      expect(describe_(out)).toMatchSnapshot();
      // Zero bend leaves the shape where it was.
      const flat = boundsOfGeometry(run(id, { bend: 0 }, circle).geometry!)!;
      expect(flat.minX).toBeCloseTo(0, 3);
      expect(flat.maxY).toBeCloseTo(100, 3);
    });
  }

  it('warp-arc raises the middle of the object more than its sides, and vertical bends sideways', () => {
    const horizontal = boundsOfGeometry(run('warp-arc', { bend: 50 }).geometry!)!;
    expect(horizontal.minY).toBeLessThan(0);
    const vertical = boundsOfGeometry(run('warp-arc', { bend: 50, orientation: 'vertical' }).geometry!)!;
    expect(vertical.minX).toBeLessThan(0);
  });

  it('offset-path grows a square by the offset with mitred corners, and a circle stays round', () => {
    const grown = run('offset-path', { offset: 10, join: 'miter' }).geometry!;
    const b = boundsOfGeometry(grown)!;
    expect([r(b.minX), r(b.maxX)]).toEqual([-10, 110]);
    expect(grown.subpaths[0]!.anchors).toHaveLength(4);
    expect(describe_(grown)).toMatchSnapshot();
    const shrunk = boundsOfGeometry(run('offset-path', { offset: -10 }).geometry!)!;
    expect([r(shrunk.minX), r(shrunk.maxX)]).toEqual([10, 90]);
    const round = run('offset-path', { offset: 10, join: 'round' }, circle).geometry!;
    const rb = boundsOfGeometry(round)!;
    expect(rb.minX).toBeCloseTo(-10, 0);
    // A fitted circle needs a handful of Bézier anchors, not hundreds of polygon points.
    expect(round.subpaths[0]!.anchors.length).toBeLessThanOrEqual(12);
    expect(round.subpaths[0]!.anchors.some((a) => a.in || a.out)).toBe(true);
  });

  it('outline-stroke makes a closed outline of the stroke width around an open path', () => {
    const out = run('outline-stroke', {}, line);
    const b = boundsOfGeometry(out.strokeOutline!)!;
    expect([r(b.minX), r(b.maxX), r(b.minY), r(b.maxY)].map((v) => v + 0)).toEqual([0, 100, -5, 5]);
    expect(out.geometry).toBe(line);
    // A closed square becomes a ring: an outer and an inner contour.
    const ring = run('outline-stroke', {}, square).strokeOutline!;
    expect(ring.subpaths).toHaveLength(2);
    expect(describe_(ring)).toMatchSnapshot();
  });
});

describe('appearance modifiers', () => {
  it('drop-shadow and outer-glow only describe an effect', () => {
    const s = run('drop-shadow', { dx: 3, dy: 4, blur: 6, opacity: 50, color: '#ff0000' });
    expect(s.geometry).toBeUndefined();
    expect(s.effect).toMatchObject({ type: 'shadow', dx: 3, dy: 4, blur: 6, opacity: 0.5 });
    expect(s.effect && 'color' in s.effect && s.effect.color.values).toEqual([255, 0, 0]);
    expect(run('outer-glow', { blur: 12 }).effect).toMatchObject({ type: 'glow', blur: 12 });
  });
});

describe('subdivide', () => {
  it('splits spans without duplicating anchors and keeps the contour closed', async () => {
    const { subdivide } = await import('./util');
    const out = subdivide(square, 2);
    expect(out.subpaths[0]!.anchors).toHaveLength(8);
    expect(out.subpaths[0]!.closed).toBe(true);
    const c = subdivide(circle, 4);
    expect(c.subpaths[0]!.anchors).toHaveLength(16);
    const pts = c.subpaths[0]!.anchors.map((a) => `${r(a.p.x)},${r(a.p.y)}`);
    expect(new Set(pts).size).toBe(pts.length);
  });
});

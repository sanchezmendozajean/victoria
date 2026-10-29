import { describe, expect, it } from 'vitest';
import type { Anchor } from '../model/types';
import { paramsForPreset, traceImage, type Pixels, type TraceLayer } from '.';

/** A picture built from a function giving the colour at the centre of each pixel. */
function paint(width: number, height: number, colour: (x: number, y: number) => [number, number, number, number?]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = colour(x + 0.5, y + 0.5);
      data.set([r, g, b, a], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

/** Signed area of a closed path whose segments are Béziers (flattened). */
function pathArea(anchors: readonly Anchor[]): number {
  const pts: Array<[number, number]> = [];
  const n = anchors.length;
  for (let i = 0; i < n; i++) {
    const a = anchors[i] as Anchor;
    const b = anchors[(i + 1) % n] as Anchor;
    const c1 = a.out ?? a.p;
    const c2 = b.in ?? b.p;
    for (let s = 0; s < 8; s++) {
      const t = s / 8;
      const u = 1 - t;
      pts.push([
        u * u * u * a.p.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.p.x,
        u * u * u * a.p.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.p.y,
      ]);
    }
  }
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i] as [number, number];
    const [x2, y2] = pts[(i + 1) % pts.length] as [number, number];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

const layerArea = (layer: TraceLayer) => Math.abs(layer.paths.reduce((s, p) => s + pathArea(p), 0));

describe('traceImage', () => {
  it('a black disc on white becomes one smooth path with about the right area and few anchors', () => {
    const image = paint(200, 200, (x, y) => (Math.hypot(x - 100, y - 100) < 60 ? BLACK : WHITE));
    const result = traceImage(image, paramsForPreset('bw'));
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0]!.color).toEqual([0, 0, 0]);
    expect(result.layers[0]!.paths).toHaveLength(1);
    expect(layerArea(result.layers[0]!)).toBeGreaterThan(Math.PI * 60 * 60 * 0.97);
    expect(layerArea(result.layers[0]!)).toBeLessThan(Math.PI * 60 * 60 * 1.03);
    expect(result.layers[0]!.paths[0]!.length).toBeLessThan(60);
  });

  it('a ring keeps its hole', () => {
    const image = paint(200, 200, (x, y) => {
      const d = Math.hypot(x - 100, y - 100);
      return d < 70 && d > 35 ? BLACK : WHITE;
    });
    const layer = traceImage(image, paramsForPreset('bw')).layers[0]!;
    expect(layer.paths).toHaveLength(2);
    expect(layerArea(layer)).toBeGreaterThan(Math.PI * (70 * 70 - 35 * 35) * 0.97);
    expect(layerArea(layer)).toBeLessThan(Math.PI * (70 * 70 - 35 * 35) * 1.03);
  });

  it('a square keeps four sharp corners and no handles', () => {
    const image = paint(100, 100, (x, y) => (x > 20 && x < 80 && y > 30 && y < 70 ? BLACK : WHITE));
    const [path] = traceImage(image, paramsForPreset('bw')).layers[0]!.paths;
    expect(path).toHaveLength(4);
    expect(path!.every((a) => a.in === null && a.out === null)).toBe(true);
  });

  it('noise drops specks smaller than the setting', () => {
    const image = paint(60, 60, (x, y) => (Math.abs(x - 30) < 1 && Math.abs(y - 30) < 1 ? BLACK : WHITE));
    expect(traceImage(image, { ...paramsForPreset('bw'), noise: 10 }).layers).toHaveLength(0);
    expect(traceImage(image, { ...paramsForPreset('bw'), noise: 1 }).layers).toHaveLength(1);
  });

  it('colour: finds the palette and stacks the layers without gaps (or keeps them apart when abutting)', () => {
    const image = paint(100, 100, (x, y) => (x > 30 && x < 70 && y > 30 && y < 70 ? [220, 30, 30] : [30, 60, 200]));
    const stacked = traceImage(image, { ...paramsForPreset('colors3'), colors: 2, ignoreWhite: false });
    expect(stacked.layers).toHaveLength(2);
    const [bottom, top] = stacked.layers as [TraceLayer, TraceLayer];
    expect(bottom.color[2]).toBeGreaterThan(150); // blue below
    expect(top.color[0]).toBeGreaterThan(150); // red on top
    expect(layerArea(bottom)).toBeCloseTo(100 * 100, -1); // the whole picture, red included
    const apart = traceImage(image, { ...paramsForPreset('colors3'), colors: 2, ignoreWhite: false, method: 'abutting' });
    expect(layerArea(apart.layers[0]!)).toBeCloseTo(100 * 100 - 40 * 40, -1);
  });

  it('transparent pixels and white (when ignored) are not traced', () => {
    const image = paint(60, 60, (x) => (x < 30 ? [0, 0, 0, 0] : x < 45 ? WHITE : BLACK));
    const result = traceImage(image, { ...paramsForPreset('colors3'), colors: 2, ignoreWhite: true });
    expect(result.layers).toHaveLength(1);
    expect(layerArea(result.layers[0]!)).toBeCloseTo(15 * 60, -1);
  });

  it('vectorises a 1000 px logo in under 3 seconds (the acceptance case of Phase 11)', () => {
    // Anti-aliased shapes on white: a disc, a ring and a rounded bar in 4 colours, as a scanned logo would be.
    const edge = (d: number) => Math.max(0, Math.min(1, 0.5 - d));
    const mix = (base: [number, number, number], top: [number, number, number], cover: number): [number, number, number] => [
      base[0] + (top[0] - base[0]) * cover,
      base[1] + (top[1] - base[1]) * cover,
      base[2] + (top[2] - base[2]) * cover,
    ];
    const image = paint(1000, 1000, (x, y) => {
      let c = WHITE;
      c = mix(c, [220, 40, 40], edge(Math.hypot(x - 350, y - 400) - 250));
      c = mix(c, [30, 60, 160], edge(Math.abs(Math.hypot(x - 650, y - 600) - 220) - 40));
      c = mix(c, [20, 20, 20], edge(Math.max(Math.abs(x - 500) - 380, Math.abs(y - 880) - 40)));
      c = mix(c, [240, 190, 30], edge(Math.hypot(x - 800, y - 220) - 120));
      return c;
    });
    const started = performance.now();
    const result = traceImage(image, paramsForPreset('logo'));
    const elapsed = performance.now() - started;
    expect(result.layers.length).toBeGreaterThanOrEqual(4);
    expect(elapsed).toBeLessThan(3000);
  });

  it('reports progress and can be cancelled between layers', () => {
    const image = paint(40, 40, (x) => (x < 20 ? [200, 0, 0] : [0, 0, 200]));
    const seen: number[] = [];
    traceImage(image, { ...paramsForPreset('colors3'), colors: 2 }, { progress: (v) => seen.push(v) });
    expect(seen[seen.length - 1]).toBeCloseTo(1, 9);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(() => traceImage(image, paramsForPreset('colors3'), { cancelled: () => true })).toThrow('cancelled');
  });
});

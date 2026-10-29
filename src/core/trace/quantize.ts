import type { TraceParams } from './params';

/** Pixels as the canvas gives them: RGBA, row by row. */
export interface Pixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface Quantized {
  /** Palette index per pixel, or -1 for pixels that are not traced (transparent, or white when ignored). */
  labels: Int16Array;
  /** sRGB colour of each palette entry. */
  palette: Array<[number, number, number]>;
  /** Pixels per palette entry. */
  counts: number[];
}

type Lab = [number, number, number];

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** sRGB (0-255) → CIE Lab (D65). Distances in Lab follow what the eye sees as "the same colour". */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const fx = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047);
  const fy = f(0.2126729 * R + 0.7151522 * G + 0.072175 * B);
  const fz = f((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const ALPHA_CUTOFF = 128;
const WHITE_L = 96;
const TRAIN_SAMPLES = 40_000;
const ITERATIONS = 8;

const dist2 = (a: Lab, b: Lab) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * Reduces the picture to a few flat colours: black on white for a threshold, grey levels, or k-means in Lab
 * (seeded by farthest points, so the result is always the same for the same picture).
 */
export function quantize(image: Pixels, params: TraceParams): Quantized {
  const { width, height, data } = image;
  const total = width * height;
  const labels = new Int16Array(total).fill(-1);
  const gray = params.mode !== 'color';

  const rgbAt = (i: number): [number, number, number] => {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    if (!gray) return [r, g, b];
    const y = luma(r, g, b);
    return [y, y, y];
  };
  const opaque = (i: number) => (data[i * 4 + 3] ?? 255) >= ALPHA_CUTOFF;

  if (params.mode === 'bw') {
    const palette: Quantized['palette'] = [
      [0, 0, 0],
      [255, 255, 255],
    ];
    const counts = [0, 0];
    for (let i = 0; i < total; i++) {
      if (!opaque(i)) continue;
      const y = luma(data[i * 4] ?? 0, data[i * 4 + 1] ?? 0, data[i * 4 + 2] ?? 0);
      const k = y < params.threshold ? 0 : 1;
      labels[i] = k;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    if (params.ignoreWhite) dropWhite(labels, palette, counts);
    return { labels, palette, counts };
  }

  // Training sample (evenly spread), already in Lab.
  const step = Math.max(1, Math.floor(total / TRAIN_SAMPLES));
  const sample: Lab[] = [];
  for (let i = 0; i < total; i += step) if (opaque(i)) sample.push(rgbToLab(...rgbAt(i)));
  if (sample.length === 0) return { labels, palette: [], counts: [] };

  const k = Math.max(2, Math.min(params.colors, 30, sample.length));
  const centres: Lab[] = [sample[0] as Lab];
  const nearest = sample.map((s) => dist2(s, centres[0] as Lab));
  while (centres.length < k) {
    let far = 0;
    for (let i = 1; i < sample.length; i++) if ((nearest[i] as number) > (nearest[far] as number)) far = i;
    if ((nearest[far] as number) < 1e-6) break; // fewer distinct colours than asked for
    const c = sample[far] as Lab;
    centres.push(c);
    for (let i = 0; i < sample.length; i++) nearest[i] = Math.min(nearest[i] as number, dist2(sample[i] as Lab, c));
  }
  for (let it = 0; it < ITERATIONS; it++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (const s of sample) {
      const j = closest(centres, s);
      const acc = sums[j] as number[];
      acc[0] = (acc[0] as number) + s[0];
      acc[1] = (acc[1] as number) + s[1];
      acc[2] = (acc[2] as number) + s[2];
      acc[3] = (acc[3] as number) + 1;
    }
    sums.forEach((acc, j) => {
      const n = acc[3] as number;
      if (n > 0) centres[j] = [(acc[0] as number) / n, (acc[1] as number) / n, (acc[2] as number) / n];
    });
  }

  // Assign every pixel; the palette colour is the mean of its members in sRGB.
  const sumsRgb = centres.map(() => [0, 0, 0]);
  const counts = centres.map(() => 0);
  const cache = new Map<number, number>();
  for (let i = 0; i < total; i++) {
    if (!opaque(i)) continue;
    const rgb = rgbAt(i);
    const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    let j = cache.get(key);
    if (j === undefined) {
      j = closest(centres, rgbToLab(rgb[0], rgb[1], rgb[2]));
      cache.set(key, j);
    }
    labels[i] = j;
    counts[j] = (counts[j] as number) + 1;
    const acc = sumsRgb[j] as number[];
    acc[0] = (acc[0] as number) + rgb[0];
    acc[1] = (acc[1] as number) + rgb[1];
    acc[2] = (acc[2] as number) + rgb[2];
  }
  const palette = sumsRgb.map((acc, j) => {
    const n = Math.max(1, counts[j] as number);
    return [Math.round((acc[0] as number) / n), Math.round((acc[1] as number) / n), Math.round((acc[2] as number) / n)] as [number, number, number];
  });
  if (params.ignoreWhite) dropWhite(labels, palette, counts);
  return { labels, palette, counts };
}

function closest(centres: readonly Lab[], p: Lab): number {
  let best = 0;
  let bestD = Infinity;
  for (let j = 0; j < centres.length; j++) {
    const d = dist2(centres[j] as Lab, p);
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  }
  return best;
}

/** Palette entries that are white are not traced: the paper already is white. */
function dropWhite(labels: Int16Array, palette: Quantized['palette'], counts: number[]): void {
  const white = palette.map((c) => rgbToLab(c[0], c[1], c[2])[0] > WHITE_L);
  if (!white.some(Boolean) || white.every(Boolean)) return;
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i] as number;
    if (l >= 0 && white[l]) labels[i] = -1;
  }
  white.forEach((isWhite, j) => {
    if (isWhite) counts[j] = 0;
  });
}

import type { Anchor } from '../model/types';
import { maskContours } from './contours';
import { polygonToAnchors, simplifyLoop } from './curves';
import type { TraceParams } from './params';
import { quantize, type Pixels } from './quantize';

/** One flat colour of the result and the closed outlines (outer edges and holes) that make its shape. */
export interface TraceLayer {
  color: [number, number, number];
  paths: Anchor[][];
}

export interface TraceResult {
  /** Size of the picture that was traced, in pixels (the paths are in these units). */
  width: number;
  height: number;
  /** Bottom to top. */
  layers: TraceLayer[];
}

export class TraceCancelled extends Error {
  constructor() {
    super('Trace cancelled');
  }
}

export interface TraceHooks {
  /** 0-1, called as layers finish. */
  progress?(done: number): void;
  /** Return true to stop (checked between layers). */
  cancelled?(): boolean;
}

/**
 * Calco de imagen: flat colours → one mask per colour → outlines → Bézier paths.
 * Pure and synchronous; the renderer runs it inside a Web Worker so the interface stays responsive.
 */
export function traceImage(image: Pixels, params: TraceParams, hooks: TraceHooks = {}): TraceResult {
  const { width, height } = image;
  const { labels, palette, counts } = quantize(image, params);
  hooks.progress?.(0.15);

  // Bottom layer = the colour with most pixels; the rest go on top, from more to fewer pixels.
  const order = palette.map((_, i) => i).filter((i) => (counts[i] ?? 0) > 0).sort((a, b) => (counts[b] as number) - (counts[a] as number));
  const rank = new Int16Array(palette.length).fill(-1);
  order.forEach((colour, r) => (rank[colour] = r));

  const layers: TraceLayer[] = [];
  const mask = new Uint8Array(width * height);
  for (let k = 0; k < order.length; k++) {
    if (hooks.cancelled?.()) throw new TraceCancelled();
    const colour = order[k] as number;
    // Stacked colours also cover everything above them (no gaps); abutting ones only their own pixels.
    for (let i = 0; i < mask.length; i++) {
      const label = labels[i] as number;
      mask[i] = label < 0 ? 0 : params.method === 'abutting' ? (label === colour ? 1 : 0) : (rank[label] as number) >= k ? 1 : 0;
    }
    const paths: Anchor[][] = [];
    for (const loop of maskContours(mask, width, height, Math.max(1, params.noise))) {
      const polygon = simplifyLoop(loop, params.tolerance);
      if (polygon.length >= 3) paths.push(polygonToAnchors(polygon, params.corners));
    }
    if (paths.length > 0) layers.push({ color: palette[colour] as [number, number, number], paths });
    hooks.progress?.(0.15 + (0.85 * (k + 1)) / order.length);
  }
  return { width, height, layers };
}

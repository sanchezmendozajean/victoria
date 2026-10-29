import type { Vec2 } from '../model/types';

/** Directions on the vertex grid, clockwise on screen (y down): right, down, left, up. */
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/**
 * The outlines of the set pixels of a mask, as closed loops of grid corners. Outer outlines and holes both come out
 * (as in an even-odd compound path). Loops enclosing fewer than `minArea` pixels are dropped; for a hole that fills it in.
 */
export function maskContours(mask: Uint8Array, width: number, height: number, minArea: number): Vec2[][] {
  const stride = width + 1;
  // Bit d of `edges[v]`: an edge leaves vertex v in direction d, keeping the set pixel on its right.
  const edges = new Uint8Array(stride * (height + 1));
  const used = new Uint8Array(edges.length);
  const set = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] !== 1) continue;
      if (!set(x, y - 1)) edges[y * stride + x] = (edges[y * stride + x] as number) | 1; // top: →
      if (!set(x + 1, y)) edges[y * stride + x + 1] = (edges[y * stride + x + 1] as number) | 2; // right: ↓
      if (!set(x, y + 1)) edges[(y + 1) * stride + x + 1] = (edges[(y + 1) * stride + x + 1] as number) | 4; // bottom: ←
      if (!set(x - 1, y)) edges[(y + 1) * stride + x] = (edges[(y + 1) * stride + x] as number) | 8; // left: ↑
    }
  }

  const loops: Vec2[][] = [];
  for (let start = 0; start < edges.length; start++) {
    for (let d0 = 0; d0 < 4; d0++) {
      if (!((edges[start] as number) & (1 << d0)) || (used[start] as number) & (1 << d0)) continue;
      const points: Vec2[] = [];
      let v = start;
      let d = d0;
      let area2 = 0;
      for (;;) {
        used[v] = (used[v] as number) | (1 << d);
        const x = v % stride;
        const y = (v - x) / stride;
        const nx = x + (DX[d] as number);
        const ny = y + (DY[d] as number);
        area2 += x * ny - nx * y;
        const next = ny * stride + nx;
        points.push({ x, y });
        v = next;
        if (v === start) break;
        // Prefer a right turn, then straight, then left: keeps diagonal pixels apart.
        const pick = [(d + 1) & 3, d, (d + 3) & 3].find((c) => ((edges[v] as number) & (1 << c)) && !((used[v] as number) & (1 << c)));
        if (pick === undefined) break;
        d = pick;
      }
      if (Math.abs(area2) / 2 >= minArea && points.length >= 4) loops.push(corners(points));
    }
  }
  return loops;
}

/** Drops the points that lie on a straight run: only the turns of the staircase remain. */
function corners(points: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[(i + n - 1) % n] as Vec2;
    const b = points[i] as Vec2;
    const c = points[(i + 1) % n] as Vec2;
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) !== 0) out.push(b);
  }
  return out;
}

export const loopArea = (points: readonly Vec2[]): number => {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as Vec2;
    const b = points[(i + 1) % points.length] as Vec2;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};

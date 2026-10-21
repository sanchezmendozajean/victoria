import type { Vec2 } from '../model/types';
import type { Geometry, ModifierDef, Params } from './types';
import { boundsOfGeometry, mapGeometry, num, subdivide } from './util';

// Warp: Arc, Flag, Wave and Inflate. Each maps the points of the object through a function of its normalized
// position (u, v in −1…1 across the bounding box); spans are split first so that the curves bend smoothly.

type Shape = (u: number, v: number, bend: number) => Vec2;

const SHAPES: Record<string, Shape> = {
  // Columns follow a parabola: the object arches like a rainbow.
  arc: (u, v, b) => ({ x: 0, y: -b * (1 - u * u) }),
  // One full sine wave across the width.
  flag: (u, _v, b) => ({ x: 0, y: b * Math.sin(Math.PI * (u + 1)) }),
  // Like the flag, but the top and the bottom swing opposite ways.
  wave: (u, v, b) => ({ x: 0, y: b * Math.sin(Math.PI * (u + 1)) * (1 - 0.6 * v) }),
  // Pillow: the middle of every side is pushed outward.
  inflate: (u, v, b) => ({ x: b * u * (1 - v * v) * 0.8, y: b * v * (1 - u * u) * 0.8 }),
};

function warpModifier(id: string, shape: keyof typeof SHAPES, defaults: Params): ModifierDef {
  return {
    id,
    icon: id,
    category: 'warp',
    affectsGeometry: true,
    defaults,
    schema: [
      { type: 'select', key: 'orientation', options: ['horizontal', 'vertical'] },
      { type: 'number', key: 'bend', unit: 'percent', min: -100, max: 100, step: 1, decimals: 1, slider: true },
      { type: 'number', key: 'distortH', unit: 'percent', min: -100, max: 100, step: 1, decimals: 1, slider: true },
      { type: 'number', key: 'distortV', unit: 'percent', min: -100, max: 100, step: 1, decimals: 1, slider: true },
    ],
    apply(input: Geometry, params: Params) {
      const b = boundsOfGeometry(input);
      if (!b || b.maxX - b.minX === 0 || b.maxY - b.minY === 0) return { geometry: input };
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const vertical = params.orientation === 'vertical';
      const bend = num(params, 'bend', 0) / 100;
      const dH = num(params, 'distortH', 0) / 100;
      const dV = num(params, 'distortV', 0) / 100;
      const fn = SHAPES[shape] as Shape;
      const map = (p: Vec2): Vec2 => {
        const u = (2 * (p.x - cx)) / w;
        const v = (2 * (p.y - cy)) / h;
        // Vertical warps swap the roles of the axes.
        const d = vertical ? fn(v, u, bend) : fn(u, v, bend);
        const dx = (vertical ? d.y : d.x) * (w / 2);
        const dy = (vertical ? d.x : d.y) * (h / 2);
        return { x: p.x + dx + dH * (w / 2) * v, y: p.y + dy + dV * (h / 2) * u };
      };
      return { geometry: mapGeometry(subdivide(input, 8), map) };
    },
  };
}

export const warpArc = warpModifier('warp-arc', 'arc', { orientation: 'horizontal', bend: 50, distortH: 0, distortV: 0 });
export const warpFlag = warpModifier('warp-flag', 'flag', { orientation: 'horizontal', bend: 50, distortH: 0, distortV: 0 });
export const warpWave = warpModifier('warp-wave', 'wave', { orientation: 'horizontal', bend: 50, distortH: 0, distortV: 0 });
export const warpInflate = warpModifier('warp-inflate', 'inflate', { orientation: 'horizontal', bend: 50, distortH: 0, distortV: 0 });

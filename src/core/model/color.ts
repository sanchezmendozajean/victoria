import type { Color } from './types';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Component ranges (documented here because specs/02 does not fix them):
 * rgb 0–255 · cmyk 0–100 each · hsb h 0–360, s and b 0–100 · gray 0–100 as "% black" (0 = white).
 * CMYK is converted naively; colour management is a non-goal of v1 (specs/00).
 */
export function colorToRgb(color: Color): [number, number, number] {
  const v = color.values;
  switch (color.model) {
    case 'rgb':
      return [clamp(v[0] ?? 0, 0, 255), clamp(v[1] ?? 0, 0, 255), clamp(v[2] ?? 0, 0, 255)];
    case 'gray': {
      const g = 255 * (1 - clamp(v[0] ?? 0, 0, 100) / 100);
      return [g, g, g];
    }
    case 'cmyk': {
      const [c = 0, m = 0, y = 0, k = 0] = v.map((x) => clamp(x, 0, 100) / 100);
      return [255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k)];
    }
    case 'hsb': {
      const h = (((v[0] ?? 0) % 360) + 360) % 360;
      const s = clamp(v[1] ?? 0, 0, 100) / 100;
      const b = clamp(v[2] ?? 0, 0, 100) / 100;
      const f = (n: number) => {
        const k = (n + h / 60) % 6;
        return 255 * b * (1 - s * Math.max(0, Math.min(k, 4 - k, 1)));
      };
      return [f(5), f(3), f(1)];
    }
  }
}

/** CSS `rgb()`/`rgba()` string for painting. */
export function colorToCss(color: Color, extraAlpha = 1): string {
  const [r, g, b] = colorToRgb(color).map(Math.round) as [number, number, number];
  const alpha = clamp((color.alpha ?? 1) * extraAlpha, 0, 1);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${Math.round(alpha * 1000) / 1000})`;
}

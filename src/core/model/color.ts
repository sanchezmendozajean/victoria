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

// ── Conversions between models (Phase 6) ──────────────────────────────────────────

const round = (v: number, digits = 4) => Math.round(v * 10 ** digits) / 10 ** digits;

/** sRGB 0–255 → HSB (h 0–360, s and b 0–100). */
export function rgbToHsb(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : (d / max) * 100, max * 100];
}

/** sRGB 0–255 → CMYK 0–100 (the naive conversion colorToRgb inverts; colour management is out of scope). */
export function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const k = 1 - Math.max(r, g, b) / 255;
  if (k >= 1) return [0, 0, 0, 100];
  const c = (1 - r / 255 - k) / (1 - k);
  const m = (1 - g / 255 - k) / (1 - k);
  const y = (1 - b / 255 - k) / (1 - k);
  return [c * 100, m * 100, y * 100, k * 100];
}

/** The same colour in another model (alpha kept). Gray takes the luminance, as "% black". */
export function convertColor(color: Color, model: Color['model']): Color {
  if (color.model === model) return color;
  const [r, g, b] = colorToRgb(color);
  const alpha = color.alpha === undefined ? {} : { alpha: color.alpha };
  switch (model) {
    case 'rgb':
      return { model, values: [round(r), round(g), round(b)], ...alpha };
    case 'hsb':
      return { model, values: rgbToHsb(r, g, b).map((v) => round(v)), ...alpha };
    case 'cmyk':
      return { model, values: rgbToCmyk(r, g, b).map((v) => round(v)), ...alpha };
    case 'gray':
      return { model, values: [round((1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255) * 100)], ...alpha };
  }
}

/** `#RRGGBB` (uppercase) of any colour. */
export function colorToHex(color: Color): string {
  const [r, g, b] = colorToRgb(color).map((v) => Math.round(v)) as [number, number, number];
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Parses `#RGB`, `#RRGGBB` or the same without `#`. null when invalid. */
export function hexToColor(text: string): Color | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!match) return null;
  let hex = match[1] as string;
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return { model: 'rgb', values: [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) };
}

/** True when both colours paint the same sRGB value and alpha (models may differ). */
export function sameColor(a: Color, b: Color): boolean {
  const [ar, ag, ab] = colorToRgb(a);
  const [br, bg, bb] = colorToRgb(b);
  return Math.abs(ar - br) < 0.5 && Math.abs(ag - bg) < 0.5 && Math.abs(ab - bb) < 0.5 && Math.abs((a.alpha ?? 1) - (b.alpha ?? 1)) < 0.001;
}

/** Nearest "web safe" colour (each channel a multiple of 51). */
export function toWebSafe(color: Color): Color {
  const [r, g, b] = colorToRgb(color).map((v) => Math.round(v / 51) * 51) as [number, number, number];
  return { model: 'rgb', values: [r, g, b], ...(color.alpha === undefined ? {} : { alpha: color.alpha }) };
}

/** Number of values and their ranges per model, for sliders and fields. */
export const COLOR_CHANNELS: Record<Color['model'], ReadonlyArray<{ id: string; max: number }>> = {
  rgb: [
    { id: 'R', max: 255 },
    { id: 'G', max: 255 },
    { id: 'B', max: 255 },
  ],
  hsb: [
    { id: 'H', max: 360 },
    { id: 'S', max: 100 },
    { id: 'B', max: 100 },
  ],
  cmyk: [
    { id: 'C', max: 100 },
    { id: 'M', max: 100 },
    { id: 'Y', max: 100 },
    { id: 'K', max: 100 },
  ],
  gray: [{ id: 'K', max: 100 }],
};

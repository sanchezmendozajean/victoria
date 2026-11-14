import { PANEL_ORDER, type PanelId } from './registry';

/** Size of the floating window of a strip panel, remembered per panel across restarts. */
export interface FloatSize {
  w: number;
  h: number;
}

export type FloatSizes = Partial<Record<PanelId, FloatSize>>;

export const FLOAT_SIZES_KEY = 'victoria.floatSizes';

const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 50 && n <= 10000;

/** Parses what was stored; anything that is not a known panel with a sane size is dropped. */
export function parseFloatSizes(raw: string | null): FloatSizes {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const out: FloatSizes = {};
    for (const id of PANEL_ORDER) {
      const s = data?.[id] as Partial<FloatSize> | undefined;
      if (s && valid(s.w) && valid(s.h)) out[id] = { w: s.w, h: s.h };
    }
    return out;
  } catch {
    return {};
  }
}

export function loadFloatSizes(): FloatSizes {
  try {
    return parseFloatSizes(localStorage.getItem(FLOAT_SIZES_KEY));
  } catch {
    return {};
  }
}

export function saveFloatSizes(sizes: FloatSizes): void {
  try {
    localStorage.setItem(FLOAT_SIZES_KEY, JSON.stringify(sizes));
  } catch {
    // Storage can be unavailable; the size then lasts for the session only.
  }
}

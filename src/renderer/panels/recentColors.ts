import { colorToHex, hexToColor, type Color } from '../../core';

const KEY = 'victoria.recentColors';
const MAX = 12;

/** Recently used colours are a per-user interface preference (never document data). */
export function loadRecentColors(): Color[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(list)) return [];
    return list.map((h) => (typeof h === 'string' ? hexToColor(h) : null)).filter((c): c is Color => c !== null);
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();
let version = 0;

export const subscribeRecentColors = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const recentColorsVersion = (): number => version;

export function rememberColor(color: Color): void {
  const hex = colorToHex(color);
  const next = [hex, ...loadRecentColors().map(colorToHex).filter((h) => h !== hex)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the list just does not persist.
  }
  version++;
  listeners.forEach((l) => l());
}

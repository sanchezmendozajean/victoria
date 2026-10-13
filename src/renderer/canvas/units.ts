import type { Units } from '../../core';

/** Points per unit. The document stores pt; units exist only in the presentation layer (CLAUDE.md rule 7). */
export const PT_PER_UNIT: Record<Units, number> = {
  pt: 1,
  px: 1,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  in: 72,
};

export const ptToUnit = (pt: number, units: Units): number => pt / PT_PER_UNIT[units];
export const unitToPt = (value: number, units: Units): number => value * PT_PER_UNIT[units];

/** "12,5 mm"-style text without trailing zeros (Spanish decimal comma). */
export function formatLength(pt: number, units: Units, maxDecimals = 2): string {
  const value = ptToUnit(pt, units);
  const text = (Math.round(value * 10 ** maxDecimals) / 10 ** maxDecimals).toFixed(maxDecimals).replace(/\.?0+$/, '');
  return `${text === '-0' ? '0' : text.replace('.', ',')} ${units}`;
}

export interface RulerScale {
  /** Distance between labelled marks, in document units. */
  every: number;
  /** Minor intervals between two labelled marks. */
  divisions: number;
}

const MIN_LABEL_GAP_PX = 64;

/** Picks 1·2·5 × 10^k so labelled marks are at least ~64 px apart at the current zoom. */
export function rulerScale(zoom: number, units: Units): RulerScale {
  const pxPerUnit = zoom * PT_PER_UNIT[units];
  const target = MIN_LABEL_GAP_PX / pxPerUnit;
  const exponent = Math.floor(Math.log10(target));
  for (let e = exponent; e <= exponent + 1; e++) {
    for (const [mantissa, divisions] of [[1, 10], [2, 4], [5, 5]] as const) {
      const every = mantissa * 10 ** e;
      if (every >= target) return { every, divisions };
    }
  }
  return { every: 10 ** (exponent + 1), divisions: 10 };
}

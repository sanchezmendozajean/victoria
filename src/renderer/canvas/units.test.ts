import { describe, expect, it } from 'vitest';
import { formatLength, PT_PER_UNIT, ptToUnit, rulerScale, unitToPt } from './units';

describe('units', () => {
  it('converts between points and every document unit', () => {
    expect(ptToUnit(72, 'in')).toBe(1);
    expect(ptToUnit(72, 'px')).toBe(72);
    expect(unitToPt(25.4, 'mm')).toBeCloseTo(72, 9);
    expect(unitToPt(2.54, 'cm')).toBeCloseTo(72, 9);
    expect(PT_PER_UNIT.pt).toBe(1);
  });

  it('formats lengths with a decimal comma and no trailing zeros', () => {
    expect(formatLength(72, 'in')).toBe('1 in');
    expect(formatLength(595.276, 'mm')).toBe('210 mm');
    expect(formatLength(10, 'mm')).toBe('3,53 mm');
    expect(formatLength(-0.001, 'pt')).toBe('0 pt');
    expect(formatLength(0, 'px')).toBe('0 px');
  });
});

describe('rulerScale', () => {
  it('keeps labelled marks at least 64 px apart at any zoom', () => {
    for (const units of ['pt', 'mm', 'in'] as const) {
      for (const zoom of [0.03, 0.1, 0.5, 1, 2, 8, 64, 640]) {
        const { every } = rulerScale(zoom, units);
        expect(every * PT_PER_UNIT[units] * zoom).toBeGreaterThanOrEqual(64 - 1e-6);
      }
    }
  });

  it('uses 1 · 2 · 5 steps and the matching subdivisions', () => {
    expect(rulerScale(1, 'pt')).toEqual({ every: 100, divisions: 10 }); // target 64 → 100
    expect(rulerScale(2, 'pt')).toEqual({ every: 50, divisions: 5 }); // target 32 → 50
    expect(rulerScale(4, 'pt')).toEqual({ every: 20, divisions: 4 }); // target 16 → 20
    expect(rulerScale(8, 'pt')).toEqual({ every: 10, divisions: 10 });
  });

  it('shows fractions of a unit when zoomed far in', () => {
    const { every } = rulerScale(640, 'mm');
    expect(every).toBeLessThan(1);
    expect(every).toBeGreaterThan(0);
  });
});

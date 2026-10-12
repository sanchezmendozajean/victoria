import { describe, expect, it } from 'vitest';
import { rulerTicks } from './Rulers';

describe('rulerTicks', () => {
  it('puts a labelled major mark at the origin and subdivides it in eighths', () => {
    // 12 px per unit, a label every 4 units → a major mark every 48 px, minor every 6 px.
    const ticks = rulerTicks(200, 60, 12, 4);
    expect(ticks.find((t) => t.pos === 60)).toMatchObject({ size: 18, label: '0' });
    expect(ticks.find((t) => t.pos === 66)).toMatchObject({ size: 4, label: '' });
    expect(ticks.find((t) => t.pos === 84)).toMatchObject({ size: 8, label: '' });
    expect(ticks.find((t) => t.pos === 108)).toMatchObject({ size: 18, label: '4' });
  });

  it('labels negative values left of the origin and never draws outside the ruler', () => {
    const ticks = rulerTicks(200, 60, 12, 4);
    expect(ticks.find((t) => t.pos === 12)).toMatchObject({ label: '-4' });
    expect(ticks.every((t) => t.pos >= 0 && t.pos < 200)).toBe(true);
  });
});

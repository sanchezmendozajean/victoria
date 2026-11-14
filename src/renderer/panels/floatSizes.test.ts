import { describe, expect, it } from 'vitest';
import { parseFloatSizes } from './floatSizes';
import { PANEL_ORDER } from './registry';

describe('parseFloatSizes', () => {
  const [a, b] = PANEL_ORDER;

  it('keeps one size per known panel', () => {
    const raw = JSON.stringify({ [a as string]: { w: 400, h: 500 }, [b as string]: { w: 300, h: 200 }, unknown: { w: 300, h: 300 } });
    expect(parseFloatSizes(raw)).toEqual({ [a as string]: { w: 400, h: 500 }, [b as string]: { w: 300, h: 200 } });
  });

  it('drops broken entries and survives garbage', () => {
    expect(parseFloatSizes(JSON.stringify({ [a as string]: { w: -5, h: 500 } }))).toEqual({});
    expect(parseFloatSizes(JSON.stringify({ [a as string]: { w: 'x', h: 500 } }))).toEqual({});
    expect(parseFloatSizes('{not json')).toEqual({});
    expect(parseFloatSizes(null)).toEqual({});
  });
});

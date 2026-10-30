import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pushRecent, sanitizeRecent } from './recentList';

const abs = (name: string) => path.resolve('/docs', name);

describe('recent files', () => {
  it('the latest goes first, without duplicates, up to the limit', () => {
    const list = pushRecent([abs('a.vict'), abs('b.vict')], abs('b.vict'));
    expect(list).toEqual([abs('b.vict'), abs('a.vict')]);
    expect(pushRecent([abs('a.vict'), abs('b.vict'), abs('c.vict')], abs('d.vict'), 3)).toEqual([abs('d.vict'), abs('a.vict'), abs('b.vict')]);
  });

  it('what was stored is cleaned: only absolute .vict paths, once each', () => {
    expect(sanitizeRecent(null)).toEqual([]);
    expect(sanitizeRecent([abs('a.vict'), 'relative.vict', abs('b.txt'), 3, abs('a.vict'), abs('C.VICT')])).toEqual([abs('a.vict'), abs('C.VICT')]);
    expect(sanitizeRecent(Array.from({ length: 30 }, (_, i) => abs(`${i}.vict`)))).toHaveLength(12);
  });
});

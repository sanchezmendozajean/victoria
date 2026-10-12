import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ICONS } from '../../src/renderer/icons/catalog.generated';

describe('icon catalog', () => {
  it('contains every id listed in the tables of specs/11-iconografia.md', () => {
    const spec = readFileSync(new URL('../../specs/11-iconografia.md', import.meta.url), 'utf8');
    const ids = [...spec.matchAll(/^\| ([a-z][a-z0-9-]+) \|/gm)].map((m) => m[1] as string).filter((id) => id !== 'id');
    expect(ids.length).toBeGreaterThan(40);
    expect(ids.filter((id) => !(id in ICONS))).toEqual([]);
  });

  it('has 24-grid markup for every icon', () => {
    for (const [id, markup] of Object.entries(ICONS)) expect(markup, id).toMatch(/^<(path|rect|circle|g|ellipse)/);
  });
});

import { describe, expect, it } from 'vitest';
import { t } from './index';

describe('t', () => {
  it('returns Spanish strings', () => {
    expect(t('menu.file')).toBe('Archivo');
  });
  it('interpolates parameters', () => {
    expect(t('status.savedAgo', { minutes: 3 })).toBe('Guardado hace 3 min');
  });
  it('leaves unknown placeholders untouched', () => {
    expect(t('spaces.pillTip', { name: 'Íconos' })).toBe('Íconos · {count} {artboards}');
  });
});

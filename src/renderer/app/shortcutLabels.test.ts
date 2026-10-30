import { describe, expect, it } from 'vitest';
import { SHORTCUT_SECTIONS, sectionOf, shortcutLabelKey } from './shortcutLabels';
import { DEFAULT_SHORTCUTS, type ShortcutAction } from './shortcuts';

describe('shortcut labels', () => {
  const actions = Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[];

  it('every action has a name in Spanish (the dialog lists them all)', () => {
    expect(actions.filter((action) => shortcutLabelKey(action) === null)).toEqual([]);
  });

  it('every action belongs to a section of the dialog', () => {
    expect(actions.filter((action) => !SHORTCUT_SECTIONS.includes(sectionOf(action)))).toEqual([]);
  });
});

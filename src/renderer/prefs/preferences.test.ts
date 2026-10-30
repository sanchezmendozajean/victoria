import { describe, expect, it } from 'vitest';
import { AutosavePolicy } from '../../core';
import { DEFAULT_PREFERENCES, pencilTolerancePx, sanitizePreferences, sanitizeShortcuts } from './preferences';

describe('preferences', () => {
  it('unknown or out-of-range stored values fall back to the defaults, valid ones are kept', () => {
    expect(sanitizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences('x')).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences({ autoAddDelete: 'yes', pencilFidelity: 9, autosaveMinutes: -3 })).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences({ autoAddDelete: false, pencilFidelity: 5, autosaveMinutes: 10.4 })).toEqual({ autoAddDelete: false, pencilFidelity: 5, autosaveMinutes: 10, startScreen: false, placeLinked: false, shortcuts: {}, linuxNoticeSeen: false });
  });

  it('higher pencil fidelity means a smaller tolerance, and 3 is the original 2.5 px', () => {
    const tolerances = ([1, 2, 3, 4, 5] as const).map(pencilTolerancePx);
    expect(tolerances).toEqual([...tolerances].sort((a, b) => b - a));
    expect(pencilTolerancePx(3)).toBe(2.5);
  });

  it('the autosave interval can be changed after a policy was made', () => {
    const policy = new AutosavePolicy(0, 0);
    expect(policy.shouldSave(1, 120_000)).toBe(true);
    expect(policy.shouldSave(1, 120_000, 5 * 60_000)).toBe(false);
    expect(policy.shouldSave(1, 5 * 60_000, 5 * 60_000)).toBe(true);
  });
});

describe('stored shortcut changes', () => {
  it('keeps valid changes, drops unknown actions and invalid accelerators', () => {
    expect(sanitizeShortcuts({ 'tool.tool-pen': 'Shift+P', nope: 'K', 'file.save': 'bogus+', 'edit.undo': 7 })).toEqual({ 'tool.tool-pen': 'Shift+P' });
    expect(sanitizeShortcuts(null)).toEqual({});
  });

  it('drops the changes that would put two actions on one key, but lets two actions swap keys', () => {
    // Pen takes the Selection tool's V while Selection keeps it: a clash, so Pen's change goes.
    expect(sanitizeShortcuts({ 'tool.tool-pen': 'V' })).toEqual({});
    // Selection and Pen swap their keys: nothing clashes in the end.
    expect(sanitizeShortcuts({ 'tool.tool-select': 'P', 'tool.tool-pen': 'V' })).toEqual({ 'tool.tool-select': 'P', 'tool.tool-pen': 'V' });
    // The same key typed two ways is still one key.
    expect(sanitizeShortcuts({ 'tool.tool-pen': 'CmdOrCtrl+Shift+Q', 'tool.tool-lasso': 'Shift+CmdOrCtrl+Q' })).toEqual({});
  });
});

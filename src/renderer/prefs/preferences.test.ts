import { describe, expect, it } from 'vitest';
import { AutosavePolicy } from '../../core';
import { DEFAULT_PREFERENCES, pencilTolerancePx, sanitizePreferences } from './preferences';

describe('preferences', () => {
  it('unknown or out-of-range stored values fall back to the defaults, valid ones are kept', () => {
    expect(sanitizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences('x')).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences({ autoAddDelete: 'yes', pencilFidelity: 9, autosaveMinutes: -3 })).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences({ autoAddDelete: false, pencilFidelity: 5, autosaveMinutes: 10.4 })).toEqual({ autoAddDelete: false, pencilFidelity: 5, autosaveMinutes: 10, startScreen: false });
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

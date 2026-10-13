import { describe, expect, it } from 'vitest';
import { AutosavePolicy, AUTOSAVE_INTERVAL_MS } from './policy';

describe('AutosavePolicy', () => {
  it('uses 60 s', () => {
    expect(AUTOSAVE_INTERVAL_MS).toBe(60_000);
  });

  it('does nothing without changes, however long it waits', () => {
    const policy = new AutosavePolicy(0, 0);
    expect(policy.shouldSave(0, 10 * 60_000)).toBe(false);
  });

  it('saves once 60 s have passed since the last autosave and content changed', () => {
    const policy = new AutosavePolicy(0, 0);
    expect(policy.shouldSave(1, 59_999)).toBe(false);
    expect(policy.shouldSave(1, 60_000)).toBe(true);
  });

  it('starts a new interval after each autosave and ignores already-saved revisions', () => {
    const policy = new AutosavePolicy(0, 0);
    policy.markSaved(3, 60_000);
    expect(policy.shouldSave(3, 200_000)).toBe(false);
    expect(policy.shouldSave(4, 100_000)).toBe(false);
    expect(policy.shouldSave(4, 120_000)).toBe(true);
  });
});

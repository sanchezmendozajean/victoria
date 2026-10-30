import { describe, expect, it } from 'vitest';
import {
  acceleratorFromEvent,
  DEFAULT_SHORTCUTS,
  findConflict,
  findShortcutAction,
  formatAccelerator,
  isValidAccelerator,
  matchesAccelerator,
  normalizeAccelerator,
  setShortcutOverrides,
  SHORTCUTS,
  type KeyEventLike,
} from './shortcuts';

const key = (k: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('formatAccelerator', () => {
  it('uses Illustrator-style Spanish names in spec order', () => {
    expect(formatAccelerator('Shift+CmdOrCtrl+S')).toBe('Mayús+Ctrl+S');
    expect(formatAccelerator('Alt+Shift+CmdOrCtrl+E')).toBe('Alt+Mayús+Ctrl+E');
    expect(formatAccelerator('CmdOrCtrl+Alt+PageUp')).toBe('Ctrl+Alt+RePág');
    expect(formatAccelerator('Delete')).toBe('Supr');
    expect(formatAccelerator('Minus')).toBe('−');
    expect(formatAccelerator('CmdOrCtrl+Plus')).toBe('Ctrl++');
  });

  it('shows ⌘ on macOS', () => {
    expect(formatAccelerator('CmdOrCtrl+S', 'darwin')).toBe('⌘+S');
  });
});

describe('matchesAccelerator', () => {
  it('matches single-letter tool keys regardless of case', () => {
    expect(matchesAccelerator(key('p'), 'P')).toBe(true);
    expect(matchesAccelerator(key('P', { shiftKey: true }), 'P')).toBe(false);
  });

  it('requires exact modifiers', () => {
    expect(matchesAccelerator(key('m', { shiftKey: true }), 'Shift+M')).toBe(true);
    expect(matchesAccelerator(key('m'), 'Shift+M')).toBe(false);
    expect(matchesAccelerator(key('t', { ctrlKey: true }), 'T')).toBe(false);
    expect(matchesAccelerator(key('t', { ctrlKey: true }), 'CmdOrCtrl+T')).toBe(true);
    expect(matchesAccelerator(key('t', { ctrlKey: true, altKey: true }), 'CmdOrCtrl+T')).toBe(false);
  });

  it('uses Cmd on macOS and rejects a stray Ctrl', () => {
    expect(matchesAccelerator(key('s', { metaKey: true }), 'CmdOrCtrl+S', 'darwin')).toBe(true);
    expect(matchesAccelerator(key('s', { ctrlKey: true }), 'CmdOrCtrl+S', 'darwin')).toBe(false);
    expect(matchesAccelerator(key('s', { metaKey: true }), 'CmdOrCtrl+S', 'win32')).toBe(false);
  });

  it('treats shifted symbols as already shifted', () => {
    expect(matchesAccelerator(key('~', { shiftKey: true }), 'Shift+~')).toBe(true);
    expect(matchesAccelerator(key('+', { shiftKey: true }), 'Plus')).toBe(true);
    expect(matchesAccelerator(key('-'), 'Minus')).toBe(true);
    expect(matchesAccelerator(key('\\'), '\\')).toBe(true);
  });

  it('matches function and named keys', () => {
    expect(matchesAccelerator(key('F6'), 'F6')).toBe(true);
    expect(matchesAccelerator(key('F6', { shiftKey: true }), 'F6')).toBe(false);
    expect(matchesAccelerator(key('F10', { ctrlKey: true }), 'CmdOrCtrl+F10')).toBe(true);
    expect(matchesAccelerator(key('Delete'), 'Delete')).toBe(true);
  });
});

describe('shortcut map', () => {
  it('has no two actions on the same accelerator', () => {
    const seen = new Map<string, string>();
    for (const [action, accelerator] of Object.entries(SHORTCUTS)) {
      const clash = seen.get(accelerator);
      expect(clash, `${action} and ${clash} share ${accelerator}`).toBeUndefined();
      seen.set(accelerator, action);
    }
  });

  it('resolves an event to its action', () => {
    expect(findShortcutAction(key('v'))).toBe('tool.tool-select');
    expect(findShortcutAction(key('F7'))).toBe('panel.layers');
    expect(findShortcutAction(key('F7', { shiftKey: true }))).toBe('panel.align');
    expect(findShortcutAction(key('t', { ctrlKey: true }))).toBe('type.character');
    expect(findShortcutAction(key('q', { ctrlKey: true }))).toBeNull();
  });
});

describe('changing shortcuts', () => {
  it('writes accelerators one canonical way, so spellings compare equal', () => {
    expect(normalizeAccelerator('CmdOrCtrl+Shift+k')).toBe('Shift+CmdOrCtrl+K');
    expect(normalizeAccelerator('Shift+CmdOrCtrl+K')).toBe('Shift+CmdOrCtrl+K');
    expect(normalizeAccelerator('Shift+~')).toBe(normalizeAccelerator('~'));
    expect(normalizeAccelerator('Alt+Shift+CmdOrCtrl+8')).toBe(normalizeAccelerator('CmdOrCtrl+Alt+Shift+8'));
  });

  it('only accepts modifiers followed by one key', () => {
    expect(isValidAccelerator('CmdOrCtrl+Alt+K')).toBe(true);
    expect(isValidAccelerator('F7')).toBe(true);
    expect(isValidAccelerator('')).toBe(false);
    expect(isValidAccelerator('Shift+')).toBe(false);
    expect(isValidAccelerator('Super+K')).toBe(false);
    expect(isValidAccelerator('Shift+Shift+K')).toBe(false);
    expect(isValidAccelerator('Control')).toBe(false);
  });

  it('turns a key press into an accelerator, ignoring bare modifiers', () => {
    expect(acceleratorFromEvent(key('Control', { ctrlKey: true }))).toBeNull();
    expect(acceleratorFromEvent(key('k', { ctrlKey: true, shiftKey: true }))).toBe('Shift+CmdOrCtrl+K');
    expect(acceleratorFromEvent(key('k', { metaKey: true }), 'darwin')).toBe('CmdOrCtrl+K');
    expect(acceleratorFromEvent(key('F7', { shiftKey: true }))).toBe('Shift+F7');
    expect(acceleratorFromEvent(key('PageUp', { ctrlKey: true, shiftKey: true }))).toBe('Shift+CmdOrCtrl+PageUp');
    expect(acceleratorFromEvent(key('+', { ctrlKey: true, shiftKey: true }))).toBe('CmdOrCtrl+Plus');
    expect(acceleratorFromEvent(key('~', { shiftKey: true }))).toBe('~');
  });

  it('finds the action that already has an accelerator', () => {
    expect(findConflict('CmdOrCtrl+S')).toBe('file.save');
    expect(findConflict('CmdOrCtrl+S', 'file.save')).toBeNull();
    expect(findConflict('Shift+CmdOrCtrl+G')).toBe('object.ungroup');
    expect(findConflict('CmdOrCtrl+Alt+Shift+F12')).toBeNull();
  });

  it('overrides replace the default everywhere the map is read, and can be undone', () => {
    try {
      setShortcutOverrides({ 'tool.tool-pen': 'Shift+P', 'file.save': 'not a key+', 'nope.action': 'K' });
      expect(SHORTCUTS['tool.tool-pen']).toBe('Shift+P');
      expect(SHORTCUTS['file.save']).toBe(DEFAULT_SHORTCUTS['file.save']); // invalid: ignored
      expect(findShortcutAction(key('P', { shiftKey: true }))).toBe('tool.tool-pen');
      expect(findShortcutAction(key('p'))).toBeNull(); // the old key no longer does it
    } finally {
      setShortcutOverrides({});
    }
    expect(SHORTCUTS['tool.tool-pen']).toBe('P');
    expect(findShortcutAction(key('p'))).toBe('tool.tool-pen');
  });
});

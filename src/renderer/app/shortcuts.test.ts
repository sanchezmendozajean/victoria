import { describe, expect, it } from 'vitest';
import { findShortcutAction, formatAccelerator, matchesAccelerator, SHORTCUTS, type KeyEventLike } from './shortcuts';

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

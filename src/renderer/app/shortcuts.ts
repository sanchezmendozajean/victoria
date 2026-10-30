// Single shortcut map (specs/09-atajos.md). Accelerators use Electron syntax, written in the
// order the spec displays them. `Plus`/`Minus` are named so "+" never splits an accelerator.
// Phase 1 only binds tools and panels; the rest exists so menus can display the shortcut.

/** The shortcuts Victoria ships with. */
export const DEFAULT_SHORTCUTS = {
  // Herramientas
  'tool.tool-select': 'V',
  'tool.tool-direct-select': 'A',
  'tool.tool-lasso': 'Q',
  'tool.tool-pen': 'P',
  'tool.tool-anchor-add': 'Plus',
  'tool.tool-anchor-delete': 'Minus',
  'tool.tool-anchor-convert': 'Shift+C',
  'tool.tool-curvature': 'Shift+~',
  'tool.tool-pencil': 'N',
  'tool.tool-blob': 'Shift+B',
  'tool.tool-eraser': 'Shift+E',
  'tool.tool-rect': 'M',
  'tool.tool-ellipse': 'L',
  'tool.tool-line': '\\',
  'tool.tool-type': 'T',
  'tool.tool-shape-builder': 'Shift+M',
  'tool.tool-scissors': 'C',
  'tool.tool-rotate': 'R',
  'tool.tool-reflect': 'O',
  'tool.tool-scale': 'S',
  'tool.tool-free-transform': 'E',
  'tool.tool-eyedropper': 'I',
  'tool.tool-gradient': 'G',
  'tool.tool-artboard': 'Shift+O',
  'tool.tool-hand': 'H',
  'tool.tool-zoom': 'Z',

  // Color
  'paint.default': 'D',
  'paint.toggle': 'X',
  'paint.swap': 'Shift+X',
  'paint.color': ',',
  'paint.gradient': '.',
  'paint.none': '/',

  // Archivo
  'file.new': 'CmdOrCtrl+N',
  'file.open': 'CmdOrCtrl+O',
  'file.save': 'CmdOrCtrl+S',
  'file.saveAs': 'Shift+CmdOrCtrl+S',
  'file.saveCopy': 'Alt+CmdOrCtrl+S',
  'file.place': 'Shift+CmdOrCtrl+P',
  'file.print': 'CmdOrCtrl+P',
  'file.close': 'CmdOrCtrl+W',
  'file.documentSetup': 'Alt+CmdOrCtrl+P',

  // Edición
  'edit.undo': 'CmdOrCtrl+Z',
  'edit.redo': 'Shift+CmdOrCtrl+Z',
  'edit.cut': 'CmdOrCtrl+X',
  'edit.copy': 'CmdOrCtrl+C',
  'edit.paste': 'CmdOrCtrl+V',
  'edit.pasteFront': 'CmdOrCtrl+F',
  'edit.pasteBack': 'CmdOrCtrl+B',
  'edit.pasteInPlace': 'Shift+CmdOrCtrl+V',
  'edit.pasteInAllArtboards': 'Alt+Shift+CmdOrCtrl+V',
  'edit.delete': 'Delete',
  'edit.preferences': 'CmdOrCtrl+K',

  // Objeto
  'object.group': 'CmdOrCtrl+G',
  'object.ungroup': 'Shift+CmdOrCtrl+G',
  'object.lock': 'CmdOrCtrl+2',
  'object.unlockAll': 'Alt+CmdOrCtrl+2',
  'object.hide': 'CmdOrCtrl+3',
  'object.showAll': 'Alt+CmdOrCtrl+3',
  'object.bringForward': 'CmdOrCtrl+]',
  'object.sendBackward': 'CmdOrCtrl+[',
  'object.bringToFront': 'Shift+CmdOrCtrl+]',
  'object.sendToBack': 'Shift+CmdOrCtrl+[',
  'object.transformAgain': 'CmdOrCtrl+D',
  'object.move': 'Shift+CmdOrCtrl+M',
  'object.applyModifiers': 'Alt+CmdOrCtrl+E',
  'object.join': 'CmdOrCtrl+J',
  'object.average': 'Alt+CmdOrCtrl+J',
  'object.compoundMake': 'CmdOrCtrl+8',
  'object.compoundRelease': 'Alt+Shift+CmdOrCtrl+8',
  'object.clipMake': 'CmdOrCtrl+7',
  'object.clipRelease': 'Alt+CmdOrCtrl+7',

  // Texto
  'type.character': 'CmdOrCtrl+T',
  'type.paragraph': 'Alt+CmdOrCtrl+T',
  'type.createOutlines': 'Shift+CmdOrCtrl+O',

  // Selección
  'select.all': 'CmdOrCtrl+A',
  'select.allInArtboard': 'Alt+CmdOrCtrl+A',
  'select.none': 'Shift+CmdOrCtrl+A',
  'select.reselect': 'CmdOrCtrl+6',

  // Modificador
  'modifier.applyLast': 'Shift+CmdOrCtrl+E',
  'modifier.lastDialog': 'Alt+Shift+CmdOrCtrl+E',

  // Vista
  'view.outline': 'CmdOrCtrl+Y',
  'view.pixelPreview': 'Alt+CmdOrCtrl+Y',
  'view.zoomIn': 'CmdOrCtrl+Plus',
  'view.zoomOut': 'CmdOrCtrl+Minus',
  'view.fitArtboard': 'CmdOrCtrl+0',
  'view.fitAll': 'Alt+CmdOrCtrl+0',
  'view.actualSize': 'CmdOrCtrl+1',
  'view.rulers': 'CmdOrCtrl+R',
  'view.guides': 'CmdOrCtrl+;',
  'view.lockGuides': 'Alt+CmdOrCtrl+;',
  'view.smartGuides': 'CmdOrCtrl+U',
  'view.grid': "CmdOrCtrl+'",
  'view.snapGrid': "Shift+CmdOrCtrl+'",
  'view.hideEdges': 'CmdOrCtrl+H',
  'view.hideArtboards': 'Shift+CmdOrCtrl+H',

  // Espacios
  'space.new': 'CmdOrCtrl+Alt+N',
  // The same on every platform: GNOME and KDE reserve Ctrl+Alt+RePág/AvPág for virtual desktops, so Windows uses Ctrl+Mayús too.
  'space.previous': 'CmdOrCtrl+Shift+PageUp',
  'space.next': 'CmdOrCtrl+Shift+PageDown',
  'space.go1': 'Alt+1',
  'space.go2': 'Alt+2',
  'space.go3': 'Alt+3',
  'space.go4': 'Alt+4',
  'space.go5': 'Alt+5',
  'space.go6': 'Alt+6',
  'space.go7': 'Alt+7',
  'space.go8': 'Alt+8',
  'space.go9': 'Alt+9',

  // Paneles (Carácter y Párrafo comparten atajo con el menú Texto)
  'panel.fill': 'F6',
  'panel.layers': 'F7',
  'panel.stroke': 'CmdOrCtrl+F10',
  'panel.gradient': 'CmdOrCtrl+F9',
  'panel.appearance': 'Shift+F6',
  'panel.align': 'Shift+F7',
  'panel.transform': 'Shift+F8',
  'panel.pathfinder': 'Shift+CmdOrCtrl+F9',
} as const satisfies Record<string, string>;

export type ShortcutAction = keyof typeof DEFAULT_SHORTCUTS;

/**
 * The shortcuts in force: the defaults with the user's changes on top (Edición › Atajos de teclado). It is one live
 * object that everything reads (menus, tooltips, the keyboard handler); `setShortcutOverrides` rewrites it in place.
 */
export const SHORTCUTS: Record<ShortcutAction, string> = { ...DEFAULT_SHORTCUTS };

export const isShortcutAction = (key: string): key is ShortcutAction => key in DEFAULT_SHORTCUTS;

export type OsFamily = 'win32' | 'linux' | 'darwin';

const DISPLAY: Record<string, string> = {
  Shift: 'Mayús',
  Plus: '+',
  Minus: '−',
  Delete: 'Supr',
  PageUp: 'RePág',
  PageDown: 'AvPág',
};

/** "Shift+CmdOrCtrl+S" → "Mayús+Ctrl+S" (Illustrator-style, Spanish). */
export function formatAccelerator(accelerator: string, os: OsFamily = 'win32'): string {
  return accelerator
    .split('+')
    .map((token) => {
      if (token === 'CmdOrCtrl') return os === 'darwin' ? '⌘' : 'Ctrl';
      return DISPLAY[token] ?? token;
    })
    .join('+');
}

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const KEY_ALIASES: Record<string, string[]> = {
  Plus: ['+', '='],
  Minus: ['-', '_'],
};

/** Symbols carry Shift inside `event.key` already ("~", "+"), so Shift is not compared for them. */
function isSymbolKey(mainKey: string): boolean {
  return mainKey in KEY_ALIASES || (mainKey.length === 1 && !/[a-z0-9]/i.test(mainKey));
}

export function matchesAccelerator(event: KeyEventLike, accelerator: string, os: OsFamily = 'win32'): boolean {
  const tokens = accelerator.split('+');
  const mainKey = tokens[tokens.length - 1] ?? '';
  const mods = new Set(tokens.slice(0, -1));

  const commandDown = os === 'darwin' ? event.metaKey : event.ctrlKey;
  const strayModifier = os === 'darwin' ? event.ctrlKey : event.metaKey;
  if (mods.has('CmdOrCtrl') !== commandDown || strayModifier) return false;
  if (mods.has('Alt') !== event.altKey) return false;

  if (isSymbolKey(mainKey)) {
    if (mods.has('Shift') && !event.shiftKey) return false;
  } else if (mods.has('Shift') !== event.shiftKey) {
    return false;
  }

  const candidates = KEY_ALIASES[mainKey] ?? [mainKey];
  return candidates.some((candidate) => candidate.toLowerCase() === event.key.toLowerCase());
}

export function findShortcutAction(event: KeyEventLike, os: OsFamily = 'win32'): ShortcutAction | null {
  for (const action of Object.keys(SHORTCUTS) as ShortcutAction[]) {
    if (matchesAccelerator(event, SHORTCUTS[action], os)) return action;
  }
  return null;
}

// ── Changing shortcuts ──

const MODIFIER_ORDER = ['Alt', 'Shift', 'CmdOrCtrl'];
const NAMED_KEYS: Record<string, string> = { ' ': 'Space', '+': 'Plus', '-': 'Minus', '=': 'Plus', _: 'Minus', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Backspace: 'Backspace', Delete: 'Delete', Enter: 'Enter', Tab: 'Tab', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown' };
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);

/** The same accelerator written one canonical way (Alt, Shift, CmdOrCtrl, key), so two spellings compare equal. */
export function normalizeAccelerator(accelerator: string): string {
  const tokens = accelerator.split('+').filter((t) => t !== '');
  // A bare "+" key splits into nothing; it is spelled "Plus" in accelerators.
  const key = tokens[tokens.length - 1] ?? '';
  const mods = new Set(tokens.slice(0, -1));
  // Symbols carry Shift inside the character, so "Shift+~" and "~" are the same shortcut.
  if (isSymbolKey(key)) mods.delete('Shift');
  const ordered = MODIFIER_ORDER.filter((m) => mods.has(m));
  return [...ordered, key.length === 1 ? key.toUpperCase() : key].join('+');
}

/** A usable accelerator: known modifiers followed by exactly one key. */
export function isValidAccelerator(accelerator: string): boolean {
  if (typeof accelerator !== 'string' || accelerator === '' || accelerator.length > 40) return false;
  const tokens = accelerator.split('+');
  const key = tokens[tokens.length - 1] ?? '';
  const mods = tokens.slice(0, -1);
  return key !== '' && mods.every((m) => MODIFIER_ORDER.includes(m)) && new Set(mods).size === mods.length && !MODIFIER_KEYS.has(key);
}

/**
 * The accelerator a key press stands for, or null while only modifiers are down. `Ctrl` is `CmdOrCtrl`
 * (⌘ on macOS); symbols that need Shift keep it inside the character, as `matchesAccelerator` expects.
 */
export function acceleratorFromEvent(event: KeyEventLike, os: OsFamily = 'win32'): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const key = NAMED_KEYS[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  const command = os === 'darwin' ? event.metaKey : event.ctrlKey;
  const symbol = event.key.length === 1 && !/[a-z0-9]/i.test(event.key);
  const mods = [event.altKey && 'Alt', event.shiftKey && !symbol && 'Shift', command && 'CmdOrCtrl'].filter((m): m is string => !!m);
  // A plain symbol such as "+" or "~" that came with Shift is the symbol itself.
  return [...mods, key].join('+');
}

/** The action that already uses this accelerator (other than `except`), if any. */
export function findConflict(accelerator: string, except?: ShortcutAction): ShortcutAction | null {
  const wanted = normalizeAccelerator(accelerator);
  for (const action of Object.keys(SHORTCUTS) as ShortcutAction[]) {
    if (action !== except && normalizeAccelerator(SHORTCUTS[action]) === wanted) return action;
  }
  return null;
}

/** Defaults plus `overrides` (action → accelerator); entries for unknown actions or with invalid accelerators are ignored. */
export function setShortcutOverrides(overrides: Readonly<Record<string, string>>): void {
  Object.assign(SHORTCUTS, DEFAULT_SHORTCUTS);
  for (const [action, accelerator] of Object.entries(overrides)) {
    if (isShortcutAction(action) && isValidAccelerator(accelerator)) SHORTCUTS[action] = accelerator;
  }
}

// Single shortcut map (specs/09-atajos.md). Accelerators use Electron syntax, written in the
// order the spec displays them. `Plus`/`Minus` are named so "+" never splits an accelerator.
// Phase 1 only binds tools and panels; the rest exists so menus can display the shortcut.

export const SHORTCUTS = {
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

  // Archivo
  'file.new': 'CmdOrCtrl+N',
  'file.open': 'CmdOrCtrl+O',
  'file.save': 'CmdOrCtrl+S',
  'file.saveAs': 'Shift+CmdOrCtrl+S',
  'file.saveCopy': 'Alt+CmdOrCtrl+S',
  'file.place': 'Shift+CmdOrCtrl+P',
  'file.exportScreens': 'Alt+CmdOrCtrl+E',
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
  'space.previous': 'CmdOrCtrl+Alt+PageUp',
  'space.next': 'CmdOrCtrl+Alt+PageDown',

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

export type ShortcutAction = keyof typeof SHORTCUTS;

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

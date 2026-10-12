import type { Platform } from './types';
import { listSystemPrinters, notImplemented } from './common';

export const win32: Platform = {
  windowChrome: 'native-overlay',

  // Phase 7: font-list + C:\Windows\Fonts and %LOCALAPPDATA%\Microsoft\Windows\Fonts.
  listFonts: async () => [],

  listPrinters: listSystemPrinters,

  // Phase 11: webContents.print from a hidden window loading the PDF.
  print: async () => notImplemented('Printing', 11),

  // The NSIS installer registers .vict (electron-builder fileAssociations); nothing to do at runtime.
  registerFileAssociation: () => undefined,

  frameOptions(chrome, colors) {
    if (chrome === 'system') return { frame: true };
    if (chrome === 'custom') return { frame: false };
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: colors.background, symbolColor: colors.symbol, height: 32 },
    };
  },

  applyOverlayColors(win, colors) {
    win.setTitleBarOverlay({ color: colors.background, symbolColor: colors.symbol, height: 32 });
  },
};

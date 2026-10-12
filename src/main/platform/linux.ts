import type { Platform } from './types';
import { listSystemPrinters, notImplemented } from './common';

export const linux: Platform = {
  windowChrome: 'custom',

  // Phase 7: `fc-list --format` (fontconfig); fallback /usr/share/fonts and ~/.local/share/fonts.
  listFonts: async () => [],

  listPrinters: listSystemPrinters,

  // Phase 11: webContents.print (CUPS); fallback `lp -d <printer> -o fit-to-page=false file.pdf`.
  print: async () => notImplemented('Printing', 11),

  // .desktop + shared-mime-info XML ship with the .deb/.rpm/AppImage (electron-builder fileAssociations).
  registerFileAssociation: () => undefined,

  // No native overlay buttons here: "native-overlay" degrades to our own buttons.
  frameOptions(chrome) {
    return { frame: chrome === 'system' };
  },

  applyOverlayColors: () => undefined,
};

import path from 'node:path';
import { fcList, scanFontDirectories } from '../fonts';
import type { Platform } from './types';
import { listSystemPrinters, notImplemented } from './common';

export const linux: Platform = {
  windowChrome: 'custom',

  // `fc-list --format` (fontconfig); without it, the usual font folders.
  listFonts: async () => {
    const listed = await fcList();
    if (listed && listed.length > 0) return listed;
    const home = process.env.HOME ?? '';
    return scanFontDirectories(['/usr/share/fonts', '/usr/local/share/fonts', path.join(home, '.local', 'share', 'fonts'), path.join(home, '.fonts')]);
  },

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

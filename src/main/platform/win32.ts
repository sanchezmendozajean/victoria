import path from 'node:path';
import { scanFontDirectories } from '../fonts';
import type { Platform } from './types';
import { listSystemPrinters } from './common';
import { printJob } from '../print';

export const win32: Platform = {
  windowChrome: 'native-overlay',

  // C:\Windows\Fonts and the per-user folder (%LOCALAPPDATA%\Microsoft\Windows\Fonts).
  listFonts: () =>
    scanFontDirectories([path.join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'), path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Windows', 'Fonts')]),

  listPrinters: listSystemPrinters,

  // webContents.print from a hidden window that shows the pages at their real size.
  print: (job) => printJob(job),

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

import type { BrowserWindowConstructorOptions } from 'electron';
import type { OverlayColors, WindowChrome } from '../../shared/ipc';

export interface FontInfo {
  family: string;
  style: string;
  path: string;
}

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

export interface PrintOptions {
  printer?: string;
  copies?: number;
}

/** Everything that differs between operating systems lives behind this interface. */
export interface Platform {
  listFonts(): Promise<FontInfo[]>;
  print(pdf: Uint8Array, opts: PrintOptions): Promise<void>;
  listPrinters(): Promise<PrinterInfo[]>;
  registerFileAssociation(): void; // .vict
  windowChrome: 'custom' | 'native-overlay';
  /** BrowserWindow options for the requested frame style; unsupported styles fall back to `custom`. */
  frameOptions(chrome: WindowChrome, colors: OverlayColors): BrowserWindowConstructorOptions;
  /** Re-colour native caption buttons after a theme change (no-op where not applicable). */
  applyOverlayColors(win: Electron.BrowserWindow, colors: OverlayColors): void;
}

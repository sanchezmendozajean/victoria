import type { BrowserWindowConstructorOptions } from 'electron';
import type { OverlayColors, WindowChrome } from '../../shared/ipc';

export interface FontInfo {
  family: string;
  style: string;
  path: string;
}

export interface PrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
}

/** What is printed: one SVG document per page (1 unit = 1 pt), all of the size `width` × `height` pt. */
export interface PrintJob {
  pages: string[];
  width: number;
  height: number;
  /** null = the default printer. */
  printer: string | null;
  copies: number;
  title: string;
}

/** Everything that differs between operating systems lives behind this interface. */
export interface Platform {
  listFonts(): Promise<FontInfo[]>;
  /** Prints the job; rejects with the reason when the printer or the system refuses it. */
  print(job: PrintJob): Promise<void>;
  listPrinters(): Promise<PrinterInfo[]>;
  registerFileAssociation(): void; // .vict
  windowChrome: 'custom' | 'native-overlay';
  /** BrowserWindow options for the requested frame style; unsupported styles fall back to `custom`. */
  frameOptions(chrome: WindowChrome, colors: OverlayColors): BrowserWindowConstructorOptions;
  /** Re-colour native caption buttons after a theme change (no-op where not applicable). */
  applyOverlayColors(win: Electron.BrowserWindow, colors: OverlayColors): void;
}

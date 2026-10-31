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
  ready: boolean;
}

/** What is printed: one SVG document per page (1 unit = 1 pt), each of its own size in pt. */
export interface PrintJob {
  pages: string[];
  sizes: Array<{ w: number; h: number }>;
  /** null = the default printer. */
  printer: string | null;
  copies: number;
  collate: boolean;
  /** false = greyscale. */
  color: boolean;
  title: string;
  /** Where to write a PDF instead of printing; set by the main process, never taken from the renderer. */
  pdfPath?: string;
}

/** Everything that differs between operating systems lives behind this interface. */
export interface Platform {
  listFonts(): Promise<FontInfo[]>;
  /** Prints the job; rejects with the reason when the printer or the system refuses it. */
  print(job: PrintJob): Promise<void>;
  listPrinters(): Promise<PrinterInfo[]>;
  /** Shows the printer's own preferences window; absent where the system has none to show. */
  openPrinterPreferences?(printer: string): Promise<void>;
  registerFileAssociation(): void; // .vict
  windowChrome: 'custom' | 'native-overlay';
  /** BrowserWindow options for the requested frame style; unsupported styles fall back to `custom`. */
  frameOptions(chrome: WindowChrome, colors: OverlayColors): BrowserWindowConstructorOptions;
  /** Re-colour native caption buttons after a theme change (no-op where not applicable). */
  applyOverlayColors(win: Electron.BrowserWindow, colors: OverlayColors): void;
}

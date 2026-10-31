// Contract between main, preload and renderer. Keep it small and explicit (specs/01-arquitectura.md).

export type OsName = 'win32' | 'linux' | 'darwin';

/**
 * How the window frame is drawn.
 * - native-overlay: frameless + native caption buttons drawn by the OS (Windows).
 * - custom: frameless + our own buttons (Linux default).
 * - system: native OS title bar; our bar keeps only menus and workspace selector.
 */
export type WindowChrome = 'custom' | 'native-overlay' | 'system';

export type Theme = 'dark' | 'light';

export interface PlatformInfo {
  os: OsName;
  chrome: WindowChrome;
  /** The desktop environment on Linux (XDG_CURRENT_DESKTOP), for notices about its reserved shortcuts. */
  desktop?: string;
  /** True under automated tests, which must not meet first-run notices. */
  testing?: boolean;
}

export interface WindowState {
  maximized: boolean;
}

/** Colours the native caption buttons need to blend with the theme (#RRGGBB). */
export interface OverlayColors {
  background: string;
  symbol: string;
}

/** Texts of native dialogs: the renderer owns all UI strings (es.json), main has no i18n. */
export interface DialogLabels {
  title: string;
  /** File type name shown in the filter, e.g. "Documento de Victoria". */
  filterName: string;
  /** When set, the open dialog also lists EPS files under this name. */
  importFilterName?: string;
}

export interface OpenedFile {
  /** Absolute path chosen by the user. Only paths returned by a dialog can be saved to later. */
  path: string;
  bytes: Uint8Array;
}

/** A document of the recent list; `modified` is the file's time in ms. */
export interface RecentFile {
  path: string;
  name: string;
  modified: number;
}

export interface SaveRequest {
  /** Path from a previous open/save; null (or an unknown path) asks the user with a Save As dialog. */
  path: string | null;
  suggestedName: string;
  bytes: Uint8Array;
  labels: DialogLabels;
}

export interface SaveResult {
  path: string;
}

export interface ClipboardContents {
  clip: Uint8Array | null;
  image: Uint8Array | null;
}

/** A file the user exports (Archivo › Exportar): one save dialog, or several files into a chosen folder. */
export interface ExportSaveRequest {
  title: string;
  suggestedName: string;
  /** Name of the file type in the dialog filter, e.g. "PDF". */
  filterName: string;
  /** Without the dot. */
  extension: string;
  bytes: Uint8Array;
}

export interface ExportFile {
  /** A plain file name (no folders). */
  name: string;
  bytes: Uint8Array;
}

export interface ExportWriteResult {
  written: string[];
  failed: Array<{ name: string; reason: string }>;
}

/** A printer the system knows. */
export interface PrinterEntry {
  name: string;
  displayName: string;
  isDefault: boolean;
  /** The system reports it as ready to take a job. */
  ready: boolean;
  /** The system can show the printer's own preferences window (`openPrinterPreferences`). */
  canConfigure: boolean;
}

/** A print job (Archivo › Imprimir): one SVG per page at its real size (1 unit = 1 pt); each page has its own size. */
export interface PrintRequest {
  pages: string[];
  sizes: Array<{ w: number; h: number }>;
  /** null = the default printer. */
  printer: string | null;
  /** Write a PDF (the main process asks where) instead of printing. */
  toPdf: boolean;
  /** Title of the "save as PDF" dialog. */
  saveTitle: string;
  copies: number;
  /** Whole copies in order (1 2 3, 1 2 3) rather than page by page (1 1, 2 2, 3 3). */
  collate: boolean;
  /** false = greyscale. */
  color: boolean;
  title: string;
}

export interface PrintOutcome {
  ok: boolean;
  /** The user dismissed the "save as PDF" dialog: nothing was done. */
  canceled?: boolean;
  error?: string;
}

export interface AutosaveEntry {
  docId: string;
  /** Last write, ms since epoch. */
  modified: number;
}

/** A font installed on the system. The renderer identifies fonts by family + style; the path only travels back to read the bytes. */
export interface SystemFont {
  family: string;
  style: string;
  path: string;
}

export const IPC = {
  getPlatformInfo: 'platform:get-info',
  minimizeWindow: 'window:minimize',
  toggleMaximizeWindow: 'window:toggle-maximize',
  closeWindow: 'window:close',
  windowState: 'window:state',
  setOverlayColors: 'window:set-overlay-colors',
  openFile: 'file:open',
  openImages: 'file:open-images',
  recentList: 'file:recent-list',
  recentOpen: 'file:recent-open',
  recentThumbnail: 'file:recent-thumbnail',
  readLinkedImage: 'file:read-linked-image',
  exportSave: 'export:save',
  exportChooseFolder: 'export:choose-folder',
  exportWrite: 'export:write',
  exportOpenFolder: 'export:open-folder',
  printList: 'print:list',
  printRun: 'print:run',
  printPreferences: 'print:preferences',
  clipboardWrite: 'clipboard:write',
  clipboardRead: 'clipboard:read',
  saveFile: 'file:save',
  autosaveWrite: 'autosave:write',
  autosaveDiscard: 'autosave:discard',
  autosaveList: 'autosave:list',
  autosaveRead: 'autosave:read',
  listFonts: 'fonts:list',
  readFont: 'fonts:read',
  beforeClose: 'app:before-close',
  closeReady: 'app:close-ready',
} as const;

/** API exposed to the renderer as `window.victoria`. */
export interface VictoriaApi {
  getPlatformInfo(): Promise<PlatformInfo>;
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  /** Returns an unsubscribe function. */
  onWindowStateChange(listener: (state: WindowState) => void): () => void;
  setOverlayColors(colors: OverlayColors): void;

  /** Open dialog + read. null if the user cancels. */
  openFile(labels: DialogLabels): Promise<OpenedFile | null>;
  /** Dialog to pick one or more PNG, JPEG or WebP files (Archivo › Colocar). Empty if the user cancels. */
  openImages(labels: DialogLabels): Promise<OpenedFile[]>;
  /** Documents opened or saved before that still exist, newest first. */
  listRecentFiles(): Promise<RecentFile[]>;
  /** Opens one of the listed documents; null when it is not on the list any more or cannot be read. */
  openRecentFile(path: string): Promise<OpenedFile | null>;
  /** The preview picture (PNG) saved inside a listed document, or null. */
  recentThumbnail(path: string): Promise<Uint8Array | null>;
  /** The bytes of the file a linked image points at; null when it is missing, too big or not a PNG, JPEG or WebP. */
  readLinkedImage(path: string): Promise<Uint8Array | null>;
  /** Writes atomically (temp file + rename). null if the user cancels the Save As dialog. */
  saveFile(request: SaveRequest): Promise<SaveResult | null>;

  /** Save dialog + write for one exported file. null if the user cancels. */
  exportSaveFile(request: ExportSaveRequest): Promise<SaveResult | null>;
  /** Folder picker for exporting several files. null if the user cancels. Only a folder returned here can be written to. */
  chooseExportFolder(title: string): Promise<string | null>;
  /** Writes the files into a folder returned by `chooseExportFolder`; existing files with the same name are replaced. */
  writeExportFiles(folder: string, files: ExportFile[]): Promise<ExportWriteResult>;
  /** Shows a folder returned by `chooseExportFolder` in the file manager. */
  openExportFolder(folder: string): Promise<void>;

  /** The printers of the system, the default one marked. Empty when there are none. */
  listPrinters(): Promise<PrinterEntry[]>;
  /** Sends the pages to the printer at their real size. Never rejects: failures come back in `error`. */
  print(job: PrintRequest): Promise<PrintOutcome>;
  /** Opens the printer's own preferences window (only for printers with `canConfigure`). */
  openPrinterPreferences(printer: string): Promise<void>;

  /** Puts Victoria objects on the system clipboard (its own format; other applications ignore it). */
  writeClipboard(clip: Uint8Array): Promise<void>;
  /** What the system clipboard holds that Victoria can paste: its own objects, else a picture (PNG). */
  readClipboard(): Promise<ClipboardContents>;

  autosaveWrite(docId: string, bytes: Uint8Array): Promise<void>;
  autosaveDiscard(docId: string): Promise<void>;
  autosaveList(): Promise<AutosaveEntry[]>;
  autosaveRead(docId: string): Promise<Uint8Array | null>;

  /** System fonts (family, style, path), listed once per run. */
  listFonts(): Promise<SystemFont[]>;
  /** Bytes of a font returned by `listFonts`; null for anything else. */
  readFont(path: string): Promise<Uint8Array | null>;

  /**
   * Called when the user closes the window. The handler must finish its autosaves; the window closes
   * when it resolves (or after a few seconds). Returns an unsubscribe function.
   */
  onBeforeClose(handler: () => Promise<void> | void): () => void;
}

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
}

export interface OpenedFile {
  /** Absolute path chosen by the user. Only paths returned by a dialog can be saved to later. */
  path: string;
  bytes: Uint8Array;
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

export interface AutosaveEntry {
  docId: string;
  /** Last write, ms since epoch. */
  modified: number;
}

export const IPC = {
  getPlatformInfo: 'platform:get-info',
  minimizeWindow: 'window:minimize',
  toggleMaximizeWindow: 'window:toggle-maximize',
  closeWindow: 'window:close',
  windowState: 'window:state',
  setOverlayColors: 'window:set-overlay-colors',
  openFile: 'file:open',
  saveFile: 'file:save',
  autosaveWrite: 'autosave:write',
  autosaveDiscard: 'autosave:discard',
  autosaveList: 'autosave:list',
  autosaveRead: 'autosave:read',
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
  /** Writes atomically (temp file + rename). null if the user cancels the Save As dialog. */
  saveFile(request: SaveRequest): Promise<SaveResult | null>;

  autosaveWrite(docId: string, bytes: Uint8Array): Promise<void>;
  autosaveDiscard(docId: string): Promise<void>;
  autosaveList(): Promise<AutosaveEntry[]>;
  autosaveRead(docId: string): Promise<Uint8Array | null>;

  /**
   * Called when the user closes the window. The handler must finish its autosaves; the window closes
   * when it resolves (or after a few seconds). Returns an unsubscribe function.
   */
  onBeforeClose(handler: () => Promise<void> | void): () => void;
}

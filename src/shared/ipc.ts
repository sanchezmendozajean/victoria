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

export const IPC = {
  getPlatformInfo: 'platform:get-info',
  minimizeWindow: 'window:minimize',
  toggleMaximizeWindow: 'window:toggle-maximize',
  closeWindow: 'window:close',
  windowState: 'window:state',
  setOverlayColors: 'window:set-overlay-colors',
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
}

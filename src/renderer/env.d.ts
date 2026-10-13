/// <reference types="vite/client" />
import type { VictoriaApi } from '../shared/ipc';

declare global {
  /** Injected by Vite from package.json. */
  const __APP_VERSION__: string;

  interface Window {
    /** Exposed by src/preload through contextBridge. */
    victoria: VictoriaApi;
  }
}

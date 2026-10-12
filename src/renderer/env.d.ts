/// <reference types="vite/client" />
import type { VictoriaApi } from '../shared/ipc';

declare global {
  interface Window {
    /** Exposed by src/preload through contextBridge. */
    victoria: VictoriaApi;
  }
}

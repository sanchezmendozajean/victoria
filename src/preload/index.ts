import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type VictoriaApi, type WindowState } from '../shared/ipc';

// Only named functions cross the bridge; never expose ipcRenderer itself.
const api: VictoriaApi = {
  getPlatformInfo: () => ipcRenderer.invoke(IPC.getPlatformInfo),
  minimizeWindow: () => ipcRenderer.send(IPC.minimizeWindow),
  toggleMaximizeWindow: () => ipcRenderer.send(IPC.toggleMaximizeWindow),
  closeWindow: () => ipcRenderer.send(IPC.closeWindow),
  onWindowStateChange: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: WindowState) => listener(state);
    ipcRenderer.on(IPC.windowState, handler);
    return () => ipcRenderer.removeListener(IPC.windowState, handler);
  },
  setOverlayColors: (colors) => ipcRenderer.send(IPC.setOverlayColors, colors),
};

contextBridge.exposeInMainWorld('victoria', api);

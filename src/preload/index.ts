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
  openFile: (labels) => ipcRenderer.invoke(IPC.openFile, labels),
  saveFile: (request) => ipcRenderer.invoke(IPC.saveFile, request),
  autosaveWrite: (docId, bytes) => ipcRenderer.invoke(IPC.autosaveWrite, docId, bytes),
  autosaveDiscard: (docId) => ipcRenderer.invoke(IPC.autosaveDiscard, docId),
  autosaveList: () => ipcRenderer.invoke(IPC.autosaveList),
  autosaveRead: (docId) => ipcRenderer.invoke(IPC.autosaveRead, docId),
  onBeforeClose: (handler) => {
    const listener = () => {
      void Promise.resolve(handler()).finally(() => ipcRenderer.send(IPC.closeReady));
    };
    ipcRenderer.on(IPC.beforeClose, listener);
    return () => ipcRenderer.removeListener(IPC.beforeClose, listener);
  },
};

contextBridge.exposeInMainWorld('victoria', api);

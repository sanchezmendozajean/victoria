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
  openImages: (labels) => ipcRenderer.invoke(IPC.openImages, labels),
  listRecentFiles: () => ipcRenderer.invoke(IPC.recentList),
  openRecentFile: (file) => ipcRenderer.invoke(IPC.recentOpen, file),
  recentThumbnail: (file) => ipcRenderer.invoke(IPC.recentThumbnail, file),
  readLinkedImage: (file) => ipcRenderer.invoke(IPC.readLinkedImage, file),
  exportSaveFile: (request) => ipcRenderer.invoke(IPC.exportSave, request),
  chooseExportFolder: (title) => ipcRenderer.invoke(IPC.exportChooseFolder, title),
  writeExportFiles: (folder, files) => ipcRenderer.invoke(IPC.exportWrite, folder, files),
  openExportFolder: (folder) => ipcRenderer.invoke(IPC.exportOpenFolder, folder),
  listPrinters: () => ipcRenderer.invoke(IPC.printList),
  print: (job) => ipcRenderer.invoke(IPC.printRun, job),
  writeClipboard: (clip) => ipcRenderer.invoke(IPC.clipboardWrite, clip),
  readClipboard: () => ipcRenderer.invoke(IPC.clipboardRead),
  saveFile: (request) => ipcRenderer.invoke(IPC.saveFile, request),
  autosaveWrite: (docId, bytes) => ipcRenderer.invoke(IPC.autosaveWrite, docId, bytes),
  autosaveDiscard: (docId) => ipcRenderer.invoke(IPC.autosaveDiscard, docId),
  autosaveList: () => ipcRenderer.invoke(IPC.autosaveList),
  autosaveRead: (docId) => ipcRenderer.invoke(IPC.autosaveRead, docId),
  listFonts: () => ipcRenderer.invoke(IPC.listFonts),
  readFont: (path) => ipcRenderer.invoke(IPC.readFont, path),
  onBeforeClose: (handler) => {
    const listener = () => {
      void Promise.resolve(handler()).finally(() => ipcRenderer.send(IPC.closeReady));
    };
    ipcRenderer.on(IPC.beforeClose, listener);
    return () => ipcRenderer.removeListener(IPC.beforeClose, listener);
  },
};

contextBridge.exposeInMainWorld('victoria', api);

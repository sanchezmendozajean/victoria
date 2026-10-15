import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { IPC, type OverlayColors, type PlatformInfo, type SaveRequest, type WindowState } from '../shared/ipc';
import * as files from './files';
import { cachedFonts, readListedFont } from './fonts';
import type { Platform } from './platform';

const HEX = /^#[0-9a-f]{6}$/i;

function isOverlayColors(v: unknown): v is OverlayColors {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return typeof c.background === 'string' && HEX.test(c.background) && typeof c.symbol === 'string' && HEX.test(c.symbol);
}

export interface IpcContext {
  platform: Platform;
  info: PlatformInfo;
  getWindow(): BrowserWindow | null;
}

/** Handlers only answer the app window; any other sender is ignored. */
export function registerIpc(ctx: IpcContext): void {
  const fromAppWindow = (event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow | null => {
    const win = ctx.getWindow();
    return win && event.sender === win.webContents ? win : null;
  };

  ipcMain.handle(IPC.getPlatformInfo, (event) => (fromAppWindow(event) ? ctx.info : null));
  ipcMain.on(IPC.minimizeWindow, (event) => fromAppWindow(event)?.minimize());
  ipcMain.on(IPC.toggleMaximizeWindow, (event) => {
    const win = fromAppWindow(event);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on(IPC.closeWindow, (event) => fromAppWindow(event)?.close());

  ipcMain.handle(IPC.listFonts, async (event) => (fromAppWindow(event) ? cachedFonts(() => ctx.platform.listFonts()) : []));
  ipcMain.handle(IPC.readFont, async (event, file: unknown) => (fromAppWindow(event) ? readListedFont(() => ctx.platform.listFonts(), file) : null));
  ipcMain.handle(IPC.openFile, async (event, labels: unknown) => {
    const win = fromAppWindow(event);
    return win ? files.openFile(win, labels) : null;
  });
  ipcMain.handle(IPC.saveFile, async (event, request: SaveRequest) => {
    const win = fromAppWindow(event);
    return win ? files.saveFile(win, request) : null;
  });
  ipcMain.handle(IPC.autosaveWrite, async (event, docId: unknown, bytes: unknown) => {
    if (fromAppWindow(event)) await files.autosaveWrite(docId, bytes);
  });
  ipcMain.handle(IPC.autosaveDiscard, async (event, docId: unknown) => {
    if (fromAppWindow(event)) await files.autosaveDiscard(docId);
  });
  ipcMain.handle(IPC.autosaveList, (event) => (fromAppWindow(event) ? files.autosaveList() : []));
  ipcMain.handle(IPC.autosaveRead, (event, docId: unknown) => (fromAppWindow(event) ? files.autosaveRead(docId) : null));
  ipcMain.on(IPC.setOverlayColors, (event, colors: unknown) => {
    const win = fromAppWindow(event);
    if (win && ctx.info.chrome === 'native-overlay' && isOverlayColors(colors)) ctx.platform.applyOverlayColors(win, colors);
  });
}

export function broadcastWindowState(win: BrowserWindow): void {
  const state: WindowState = { maximized: win.isMaximized() };
  if (!win.isDestroyed()) win.webContents.send(IPC.windowState, state);
}

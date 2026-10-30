import { clipboard, ClipboardItem, ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { IPC, type ClipboardContents, type ExportSaveRequest, type PrintOutcome, type OverlayColors, type PlatformInfo, type SaveRequest, type WindowState } from '../shared/ipc';
import * as files from './files';
import { cachedFonts, readListedFont } from './fonts';
import type { Platform } from './platform';
import { validateJob } from './printJob';

/** Clipboard format of Victoria objects: a Chromium web custom format, which behaves the same on Windows and Linux. */
const CLIP_FORMAT = 'web application/x-victoria-clip';
const MAX_CLIP_BYTES = 512 * 1024 * 1024;

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
  ipcMain.handle(IPC.openImages, async (event, labels: unknown) => {
    const win = fromAppWindow(event);
    return win ? files.openImages(win, labels) : [];
  });
  ipcMain.handle(IPC.readLinkedImage, async (event, file: unknown) => (fromAppWindow(event) ? files.readLinkedImage(file) : null));
  ipcMain.handle(IPC.recentList, async (event) => (fromAppWindow(event) ? files.listRecent() : []));
  ipcMain.handle(IPC.recentThumbnail, async (event, file: unknown) => (fromAppWindow(event) ? files.recentThumbnail(file) : null));
  ipcMain.handle(IPC.recentOpen, async (event, file: unknown) => (fromAppWindow(event) ? files.openRecent(file) : null));
  ipcMain.handle(IPC.exportSave, async (event, request: ExportSaveRequest) => {
    const win = fromAppWindow(event);
    return win ? files.exportSave(win, request) : null;
  });
  ipcMain.handle(IPC.exportChooseFolder, async (event, title: unknown) => {
    const win = fromAppWindow(event);
    return win ? files.exportChooseFolder(win, title) : null;
  });
  ipcMain.handle(IPC.exportWrite, async (event, folder: unknown, list: unknown) => (fromAppWindow(event) ? files.exportWrite(folder, list) : { written: [], failed: [] }));
  ipcMain.handle(IPC.exportOpenFolder, async (event, folder: unknown) => {
    if (fromAppWindow(event)) await files.exportOpenFolder(folder);
  });
  /** The system printers; with VICTORIA_PRINT_TO_PDF set (tests, machines without a printer) a pseudo-printer that writes a PDF comes first. */
  const printers = async () => {
    const system = await ctx.platform.listPrinters().catch(() => []);
    return process.env.VICTORIA_PRINT_TO_PDF ? [{ name: 'victoria-print-to-pdf', displayName: 'Archivo PDF (pruebas)', isDefault: true }, ...system.map((p) => ({ ...p, isDefault: false }))] : system;
  };
  ipcMain.handle(IPC.printList, async (event) => (fromAppWindow(event) ? printers() : []));
  ipcMain.handle(IPC.printRun, async (event, job: unknown): Promise<PrintOutcome> => {
    if (!fromAppWindow(event)) return { ok: false, error: "Unknown sender" };
    try {
      validateJob(job);
      // Only a printer the system lists (or the default one) may receive a job.
      if (job.printer !== null && !(await printers()).some((p) => p.name === job.printer)) throw new Error("Unknown printer");
      await ctx.platform.print(job);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle(IPC.clipboardWrite, async (event, clip: unknown) => {
    if (!fromAppWindow(event) || !(clip instanceof Uint8Array) || clip.length > MAX_CLIP_BYTES) return;
    await clipboard.write([new ClipboardItem({ [CLIP_FORMAT]: new Blob([clip as unknown as ArrayBuffer]) })]);
  });
  ipcMain.handle(IPC.clipboardRead, async (event): Promise<ClipboardContents> => {
    const empty: ClipboardContents = { clip: null, image: null };
    if (!fromAppWindow(event)) return empty;
    const bytesOf = async (item: ClipboardItem, type: string) => new Uint8Array(await ((await item.getType(type)) as Blob).arrayBuffer());
    try {
      const items = await clipboard.read();
      const own = items.find((i) => i.types.includes(CLIP_FORMAT));
      if (own) return { clip: await bytesOf(own, CLIP_FORMAT), image: null };
      const picture = items.find((i) => i.types.includes('image/png'));
      return { clip: null, image: picture ? await bytesOf(picture, 'image/png') : null };
    } catch {
      return empty; // an unreadable clipboard is an empty one
    }
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

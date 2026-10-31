import { BrowserWindow } from 'electron';
import type { PrinterInfo } from './types';

export async function listSystemPrinters(): Promise<PrinterInfo[]> {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return [];
  const printers = await win.webContents.getPrintersAsync();
  // Status codes: Windows 0 = ready; CUPS 3 = idle, 4 = processing.
  const ready = (status: number | undefined) => status === undefined || (process.platform === 'win32' ? status === 0 : status === 3 || status === 4);
  return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: (p.options as Record<string, string>)['is-default'] === 'true', ready: ready((p as { status?: number }).status) }));
}

export function notImplemented(what: string, phase: number): never {
  throw new Error(`${what} is not implemented yet (Phase ${phase}).`);
}

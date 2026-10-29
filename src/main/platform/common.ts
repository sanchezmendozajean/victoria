import { BrowserWindow } from 'electron';
import type { PrinterInfo } from './types';

export async function listSystemPrinters(): Promise<PrinterInfo[]> {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return [];
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: (p.options as Record<string, string>)['is-default'] === 'true' }));
}

export function notImplemented(what: string, phase: number): never {
  throw new Error(`${what} is not implemented yet (Phase ${phase}).`);
}

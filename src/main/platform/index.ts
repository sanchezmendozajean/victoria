import type { Platform } from './types';
import { linux } from './linux';
import { win32 } from './win32';

export type { Platform, FontInfo, PrinterInfo, PrintOptions } from './types';

/** macOS must compile but is not a supported target: it reuses the Linux behaviour. */
export function getPlatform(): Platform {
  return process.platform === 'win32' ? win32 : linux;
}

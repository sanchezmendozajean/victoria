import type { ImageResource } from '../model/types';

/** What the header of a PNG, JPEG or WebP file says; no decoding (the core has no DOM). */
export interface ImageInfo {
  format: ImageResource['format'];
  /** Pixels, after the EXIF orientation of a JPEG is applied (what a browser draws). */
  width: number;
  height: number;
  /** Resolution the file declares, when it does and it is sensible. */
  dpi?: number;
}

const MAX_SIDE = 1 << 20;

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u32be = (b: Uint8Array, i: number) => (u16be(b, i) * 65536 + u16be(b, i + 2)) >>> 0;
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

const sane = (dpi: number): number | undefined => (Number.isFinite(dpi) && dpi >= 10 && dpi <= 10000 ? Math.round(dpi * 100) / 100 : undefined);

function done(format: ImageInfo['format'], width: number, height: number, dpi?: number): ImageInfo | null {
  if (!(width > 0 && height > 0 && width <= MAX_SIDE && height <= MAX_SIDE)) return null;
  const d = dpi === undefined ? undefined : sane(dpi);
  return { format, width, height, ...(d === undefined ? {} : { dpi: d }) };
}

function sniffPng(b: Uint8Array): ImageInfo | null {
  if (ascii(b, 12, 4) !== 'IHDR') return null;
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  let dpi: number | undefined;
  for (let i = 8; i + 8 <= b.length; ) {
    const length = u32be(b, i);
    const type = ascii(b, i + 4, 4);
    if (type === 'pHYs' && length >= 9 && b[i + 16] === 1) dpi = (u32be(b, i + 8) * 0.0254);
    if (type === 'IDAT' || type === 'IEND') break;
    i += 12 + length;
  }
  return done('png', width, height, dpi);
}

/** Orientation tag (1–8) of an Exif APP1 payload, or 1. */
function exifOrientation(b: Uint8Array, start: number, end: number): number {
  if (ascii(b, start, 6) !== 'Exif\0\0') return 1;
  const tiff = start + 6;
  const little = ascii(b, tiff, 2) === 'II';
  const u16 = (i: number) => (little ? u16le(b, i) : u16be(b, i));
  const u32 = (i: number) => (little ? (u16le(b, i) | (u16le(b, i + 2) << 16)) >>> 0 : u32be(b, i));
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const entries = u16(ifd);
  for (let n = 0; n < entries; n++) {
    const e = ifd + 2 + n * 12;
    if (e + 12 > end) break;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

function sniffJpeg(b: Uint8Array): ImageInfo | null {
  let dpi: number | undefined;
  let orientation = 1;
  for (let i = 2; i + 4 <= b.length; ) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const length = u16be(b, i + 2);
    const data = i + 4;
    if (marker === 0xe0 && ascii(b, data, 5) === 'JFIF\0') {
      const units = b[data + 7];
      const x = u16be(b, data + 8);
      if (units === 1) dpi = x;
      else if (units === 2) dpi = x * 2.54;
    } else if (marker === 0xe1) {
      orientation = exifOrientation(b, data, i + 2 + length);
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = u16be(b, data + 1);
      const width = u16be(b, data + 3);
      return orientation >= 5 ? done('jpeg', height, width, dpi) : done('jpeg', width, height, dpi);
    }
    i += 2 + length;
  }
  return null;
}

function sniffWebp(b: Uint8Array): ImageInfo | null {
  const kind = ascii(b, 12, 4);
  if (kind === 'VP8 ') return done('webp', u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  if (kind === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) * 16777216);
    return done('webp', (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (kind === 'VP8X') {
    const w = 1 + ((b[24] ?? 0) | ((b[25] ?? 0) << 8) | ((b[26] ?? 0) << 16));
    const h = 1 + ((b[27] ?? 0) | ((b[28] ?? 0) << 8) | ((b[29] ?? 0) << 16));
    return done('webp', w, h);
  }
  return null;
}

/** Format, size and declared resolution of an image file, or null when it is not a PNG, JPEG or WebP (or is damaged). */
export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 16) return null;
  try {
    if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return sniffPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return sniffJpeg(bytes);
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return sniffWebp(bytes);
  } catch {
    return null;
  }
  return null;
}

/** Document points a placed image takes at its natural size: its own resolution when it declares one, else 72 ppp. */
export function naturalSize(info: ImageInfo): { width: number; height: number } {
  const scale = info.dpi ? 72 / info.dpi : 1;
  return { width: info.width * scale, height: info.height * scale };
}

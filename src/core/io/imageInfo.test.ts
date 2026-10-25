import { describe, expect, it } from 'vitest';
import { naturalSize, sniffImage } from './imageInfo';

const bytes = (...parts: Array<number[] | string>): Uint8Array =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];

function png(width: number, height: number, ppm?: number): Uint8Array {
  const chunks = [bytes(...[be32(13), 'IHDR', be32(width), be32(height), [8, 6, 0, 0, 0], be32(0)])];
  if (ppm) chunks.push(bytes(be32(9), 'pHYs', be32(ppm), be32(ppm), [1], be32(0)));
  chunks.push(bytes(be32(0), 'IDAT', be32(0)));
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunks.flatMap((c) => [...c])]);
}

function jpeg(width: number, height: number, opts: { dpi?: number; orientation?: number } = {}): Uint8Array {
  const parts: Array<number[] | string> = [[0xff, 0xd8]];
  if (opts.dpi) parts.push([0xff, 0xe0], be16(16), 'JFIF\0', [1, 1, 1], be16(opts.dpi), be16(opts.dpi), [0, 0]);
  if (opts.orientation) {
    // Exif, little endian, one IFD entry (0x0112 orientation).
    const tiff = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, opts.orientation, 0, 0, 0, 0, 0, 0, 0];
    parts.push([0xff, 0xe1], be16(2 + 6 + tiff.length), 'Exif\0\0', tiff);
  }
  parts.push([0xff, 0xc0], be16(17), [8], be16(height), be16(width), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  parts.push([0xff, 0xd9]);
  return bytes(...parts);
}

describe('sniffImage', () => {
  it('reads PNG size and resolution', () => {
    expect(sniffImage(png(640, 480))).toEqual({ format: 'png', width: 640, height: 480 });
    const info = sniffImage(png(300, 150, 11811)); // 300 ppp
    expect(info?.dpi).toBeCloseTo(300, 0);
  });

  it('reads JPEG size and JFIF density', () => {
    expect(sniffImage(jpeg(1000, 500))).toEqual({ format: 'jpeg', width: 1000, height: 500 });
    expect(sniffImage(jpeg(1000, 500, { dpi: 150 }))?.dpi).toBe(150);
  });

  it('swaps the size of a JPEG whose EXIF orientation turns it', () => {
    expect(sniffImage(jpeg(4000, 3000, { orientation: 6 }))).toMatchObject({ width: 3000, height: 4000 });
    expect(sniffImage(jpeg(4000, 3000, { orientation: 3 }))).toMatchObject({ width: 4000, height: 3000 });
  });

  it('reads the three WebP flavours', () => {
    const riff = (kind: string, body: number[]) => bytes('RIFF', [0, 0, 0, 0], 'WEBP', kind, [0, 0, 0, 0], body);
    const lossy = riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 200 & 255, 0, 100, 0, 0, 0]);
    expect(sniffImage(lossy)).toEqual({ format: 'webp', width: 200, height: 100 });
    const w = 320 - 1;
    const h = 240 - 1;
    const lossless = riff('VP8L', [0x2f, w & 255, ((w >> 8) & 0x3f) | ((h & 3) << 6), (h >> 2) & 255, (h >> 10) & 15, 0, 0, 0]);
    expect(sniffImage(lossless)).toEqual({ format: 'webp', width: 320, height: 240 });
    const ext = riff('VP8X', [0, 0, 0, 0, 63, 1, 0, 199, 0, 0]);
    expect(sniffImage(ext)).toEqual({ format: 'webp', width: 320, height: 200 });
  });

  it('rejects other files, truncated headers and absurd sizes', () => {
    expect(sniffImage(bytes('GIF89a', new Array(40).fill(0)))).toBeNull();
    expect(sniffImage(png(0, 10))).toBeNull();
    expect(sniffImage(png(5_000_000, 10))).toBeNull();
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff]))).toBeNull();
    expect(sniffImage(jpeg(10, 10).slice(0, 12))).toBeNull();
  });

  it('places an image at its own resolution, or at 72 ppp when it declares none', () => {
    expect(naturalSize({ format: 'png', width: 300, height: 150, dpi: 300 })).toEqual({ width: 72, height: 36 });
    expect(naturalSize({ format: 'png', width: 300, height: 150 })).toEqual({ width: 300, height: 150 });
  });
});

import { describe, expect, it } from 'vitest';
import { artboardRegion, createArtboard, createSpace, planFiles, rasterSize, safeFileName, sequentialIds, sniffImage, withJpegDpi, withPngDpi, type ExportTarget } from '..';

const ids = sequentialIds('e');
const board = (name: string) => createArtboard(ids, { name, x: 10, y: 20, w: 100, h: 50 });
const target = (spaceName: string, artboardName: string): ExportTarget => {
  const artboard = board(artboardName);
  return { space: createSpace(ids, { name: spaceName, artboards: [artboard] }), artboard };
};

describe('artboardRegion and rasterSize', () => {
  it('is the artboard, plus its bleed when asked', () => {
    const a = { ...board('A'), bleed: { top: 3, right: 4, bottom: 5, left: 6 } };
    expect(artboardRegion(a, false)).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
    expect(artboardRegion(a, true)).toEqual({ minX: 4, minY: 17, maxX: 114, maxY: 75 });
  });

  it('scales by ppi/72 and refuses empty or too large pictures', () => {
    const r = { minX: 0, minY: 0, maxX: 100, maxY: 50 };
    expect(rasterSize(r, 72)).toEqual({ width: 100, height: 50 });
    expect(rasterSize(r, 144)).toEqual({ width: 200, height: 100 });
    expect(rasterSize(r, 300)).toEqual({ width: 417, height: 208 });
    expect(rasterSize({ minX: 0, minY: 0, maxX: 0, maxY: 10 }, 72)).toBeNull();
    expect(rasterSize({ minX: 0, minY: 0, maxX: 5000, maxY: 10 }, 300)).toBeNull(); // 20833 px wide
    expect(rasterSize({ minX: 0, minY: 0, maxX: 16384, maxY: 16384 }, 72)).toEqual({ width: 16384, height: 16384 }); // exactly the limit
    expect(rasterSize({ minX: 0, minY: 0, maxX: 16385, maxY: 10 }, 72)).toBeNull();
  });
});

describe('file names', () => {
  it('removes what Windows and Linux do not accept', () => {
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
    expect(safeFileName('  Mesa 1. ')).toBe('Mesa 1');
    expect(safeFileName('CON')).toBe('_CON');
    expect(safeFileName('')).toBe('Sin título');
    expect(safeFileName('....', 'x')).toBe('x');
    expect(safeFileName('a'.repeat(300)).length).toBe(120);
  });

  it('names one file per artboard, with suffix and extension, and makes repeats unique', () => {
    const targets = [target('Espacio 1', 'Mesa 1'), target('Espacio 1', 'Mesa 1'), target('Espacio 1', 'mesa 1'), target('Espacio 1', 'Logo/2')];
    const files = planFiles({ documentName: 'Cartel', targets, format: 'png', suffix: '@2x' });
    expect(files.map((f) => f.name)).toEqual(['Cartel-Mesa 1@2x.png', 'Cartel-Mesa 1@2x-2.png', 'Cartel-mesa 1@2x-3.png', 'Cartel-Logo_2@2x.png']);
  });

  it('adds the Space name when exporting several Spaces', () => {
    const files = planFiles({ documentName: 'Doc', targets: [target('Web', 'Inicio'), target('Móvil', 'Inicio')], format: 'svg', withSpaceName: true });
    expect(files.map((f) => f.name)).toEqual(['Doc-Web-Inicio.svg', 'Doc-Móvil-Inicio.svg']);
  });
});

describe('resolution metadata', () => {
  const png = (): Uint8Array => {
    const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const chunk = (type: string, body: number[]) => [...be(body.length), ...[...type].map((c) => c.charCodeAt(0)), ...body, 0, 0, 0, 0];
    return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', [...be(40), ...be(20), 8, 6, 0, 0, 0]), ...chunk('IDAT', [1, 2, 3]), ...chunk('IEND', [])]);
  };

  it('PNG: sets the dpi that sniffImage reads back, replacing an earlier one and keeping the picture', () => {
    const once = withPngDpi(png(), 300);
    expect(sniffImage(once)).toMatchObject({ format: 'png', width: 40, height: 20 });
    expect(sniffImage(once)?.dpi).toBeCloseTo(300, 0);
    const twice = withPngDpi(once, 150);
    expect(sniffImage(twice)?.dpi).toBeCloseTo(150, 0);
    expect(twice.length).toBe(once.length);
    const text = new TextDecoder('latin1').decode(twice);
    expect(text.indexOf('pHYs')).toBeLessThan(text.indexOf('IDAT'));
    expect(text.match(/pHYs/g)?.length).toBe(1);
  });

  it('PNG: anything else comes back untouched', () => {
    const junk = new Uint8Array(64).fill(7);
    expect(withPngDpi(junk, 300)).toBe(junk);
  });

  it('JPEG: rewrites the JFIF density, and leaves a file without JFIF alone', () => {
    const be16 = (n: number) => [(n >> 8) & 255, n & 255];
    const jfif = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...be16(16), 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, ...be16(1), ...be16(1), 0, 0, 0xff, 0xc0, ...be16(17), 8, ...be16(30), ...be16(60), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
    const out = withJpegDpi(jfif, 300);
    expect(sniffImage(out)).toMatchObject({ format: 'jpeg', width: 60, height: 30, dpi: 300 });
    expect(out).not.toBe(jfif);
    const noJfif = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, ...new Array(30).fill(0)]);
    expect(withJpegDpi(noJfif, 300)).toBe(noJfif);
  });
});

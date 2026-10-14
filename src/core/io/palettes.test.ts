import { describe, expect, it } from 'vitest';
import { parseAse, parseGpl, parsePalette } from '..';

/** Builds a minimal ASE file: groups and colour entries. */
function ase(entries: Array<{ group?: string; end?: true; name?: string; model?: string; values?: number[] }>): Uint8Array {
  const parts: number[] = [];
  const u16 = (v: number) => parts.push((v >> 8) & 255, v & 255);
  const u32 = (v: number) => parts.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  const f32 = (v: number) => {
    const b = new DataView(new ArrayBuffer(4));
    b.setFloat32(0, v);
    parts.push(b.getUint8(0), b.getUint8(1), b.getUint8(2), b.getUint8(3));
  };
  const name = (s: string) => {
    u16(s.length + 1);
    for (const c of s) u16(c.charCodeAt(0));
    u16(0);
  };
  parts.push(0x41, 0x53, 0x45, 0x46);
  u16(1);
  u16(0);
  u32(entries.length);
  for (const e of entries) {
    if (e.group !== undefined) {
      u16(0xc001);
      u32((e.group.length + 1) * 2 + 2);
      name(e.group);
    } else if (e.end) {
      u16(0xc002);
      u32(0);
    } else {
      const values = e.values ?? [];
      u16(0x0001);
      u32(((e.name ?? '').length + 1) * 2 + 2 + 4 + values.length * 4 + 2);
      name(e.name ?? '');
      for (const c of (e.model ?? 'RGB ').padEnd(4)) parts.push(c.charCodeAt(0));
      values.forEach(f32);
      u16(0);
    }
  }
  return new Uint8Array(parts);
}

describe('palette import', () => {
  it('reads GIMP palettes, skipping the header, comments and bad lines', () => {
    const text = 'GIMP Palette\nName: Demo\nColumns: 4\n# a comment\n255 0 0 Rojo\n 0 128 255\nnot a colour\n300 0 0 Fuera de rango\n';
    const list = parseGpl(text);
    expect(list.map((c) => c.name)).toEqual(['Rojo', '0 128 255', 'Fuera de rango']);
    expect(list[0]!.color).toEqual({ model: 'rgb', values: [255, 0, 0] });
    expect(list[2]!.color.values[0]).toBe(255);
  });

  it('is not fooled by other text', () => {
    expect(parseGpl('hello')).toEqual([]);
    expect(parseAse(new Uint8Array([1, 2, 3]))).toEqual([]);
  });

  it('reads ASE colours of every model and keeps their groups', () => {
    const bytes = ase([
      { name: 'Sin grupo', values: [1, 0.5, 0] },
      { group: 'Marca' },
      { name: 'Cian', model: 'CMYK', values: [1, 0, 0, 0.2] },
      { name: 'Medio', model: 'Gray', values: [0.25] },
      { end: true },
      { name: 'Blanco', model: 'LAB ', values: [1, 0, 0] },
    ]);
    const list = parseAse(bytes);
    expect(list).toHaveLength(4);
    expect(list[0]).toEqual({ name: 'Sin grupo', color: { model: 'rgb', values: [255, 128, 0] } });
    expect(list[1]).toEqual({ name: 'Cian', color: { model: 'cmyk', values: [100, 0, 0, 20] }, group: 'Marca' });
    expect(list[2]!.color).toEqual({ model: 'gray', values: [75] });
    expect(list[2]!.group).toBe('Marca');
    expect(list[3]!.group).toBeUndefined();
    const white = list[3]!.color.values;
    expect(white.every((v) => v >= 250)).toBe(true);
  });

  it('detects the format by content', () => {
    expect(parsePalette(new TextEncoder().encode('GIMP Palette\n1 2 3 Uno\n'))).toHaveLength(1);
    expect(parsePalette(ase([{ name: 'A', values: [0, 0, 0] }]))).toHaveLength(1);
  });
});

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { familyAndStyle, parseFcList, parseNameTable, readListedFont, scanFontDirectories } from './fonts';

/** A `name` table with Windows (UTF-16BE) entries. */
function nameTable(entries: Array<{ id: number; value: string; platform?: number }>): Buffer {
  const strings = entries.map((e) => (e.platform === 1 ? Buffer.from(e.value, 'latin1') : Buffer.from(e.value, 'utf16le').swap16()));
  const header = Buffer.alloc(6 + entries.length * 12);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(entries.length, 2);
  header.writeUInt16BE(header.length, 4);
  let offset = 0;
  entries.forEach((e, i) => {
    const at = 6 + i * 12;
    header.writeUInt16BE(e.platform ?? 3, at);
    header.writeUInt16BE(e.platform === 1 ? 0 : 0x409, at + 4);
    header.writeUInt16BE(e.id, at + 6);
    header.writeUInt16BE((strings[i] as Buffer).length, at + 8);
    header.writeUInt16BE(offset, at + 10);
    offset += (strings[i] as Buffer).length;
  });
  return Buffer.concat([header, ...strings]);
}

/** A minimal sfnt: header, one table record (`name`) and the table. */
function sfnt(entries: Array<{ id: number; value: string; platform?: number }>, tag = 0x00010000): Buffer {
  const table = nameTable(entries);
  const head = Buffer.alloc(12 + 16);
  head.writeUInt32BE(tag, 0);
  head.writeUInt16BE(1, 4);
  head.write('name', 12, 'latin1');
  head.writeUInt32BE(head.length, 20);
  head.writeUInt32BE(table.length, 24);
  return Buffer.concat([head, table]);
}

/** A collection with two faces sharing nothing but the file. */
function ttc(a: Buffer, b: Buffer): Buffer {
  const head = Buffer.alloc(12 + 8);
  head.write('ttcf', 0, 'latin1');
  head.writeUInt32BE(0x00010000, 4);
  head.writeUInt32BE(2, 8);
  const offA = head.length;
  const offB = offA + a.length;
  head.writeUInt32BE(offA, 12);
  head.writeUInt32BE(offB, 16);
  const shift = (buf: Buffer, by: number) => {
    const copy = Buffer.from(buf);
    copy.writeUInt32BE(copy.readUInt32BE(20) + by, 20); // table offsets are relative to the file
    return copy;
  };
  return Buffer.concat([head, shift(a, offA), shift(b, offB)]);
}

const dir = mkdtempSync(path.join(tmpdir(), 'victoria-fonts-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('name tables', () => {
  it('reads UTF-16 and Mac Roman strings', () => {
    const entries = parseNameTable(nameTable([{ id: 1, value: 'Árbol' }, { id: 2, value: 'Bold', platform: 1 }]));
    expect(entries).toEqual([
      { platform: 3, id: 1, value: 'Árbol' },
      { platform: 1, id: 2, value: 'Bold' },
    ]);
    expect(parseNameTable(Buffer.alloc(2))).toEqual([]);
  });

  it('prefers the typographic family and style, then the legacy ones, and defaults the style', () => {
    expect(familyAndStyle(parseNameTable(nameTable([{ id: 1, value: 'Foo Light' }, { id: 2, value: 'Regular' }, { id: 16, value: 'Foo' }, { id: 17, value: 'Light' }])))).toEqual({ family: 'Foo', style: 'Light' });
    expect(familyAndStyle(parseNameTable(nameTable([{ id: 1, value: 'Foo' }])))).toEqual({ family: 'Foo', style: 'Regular' });
    expect(familyAndStyle([])).toBeNull();
  });
});

describe('scanning folders', () => {
  it('lists faces from .ttf, .otf and collections, recursively, once per family + style', async () => {
    mkdirSync(path.join(dir, 'sub'), { recursive: true });
    writeFileSync(path.join(dir, 'a.ttf'), sfnt([{ id: 1, value: 'Alpha' }, { id: 2, value: 'Regular' }]));
    writeFileSync(path.join(dir, 'sub', 'b.otf'), sfnt([{ id: 16, value: 'Beta' }, { id: 17, value: 'Italic' }], 0x4f54544f));
    writeFileSync(path.join(dir, 'c.ttc'), ttc(sfnt([{ id: 1, value: 'Gamma' }, { id: 2, value: 'Regular' }]), sfnt([{ id: 1, value: 'Gamma' }, { id: 2, value: 'Bold' }])));
    writeFileSync(path.join(dir, 'dup.ttf'), sfnt([{ id: 1, value: 'Alpha' }, { id: 2, value: 'Regular' }]));
    writeFileSync(path.join(dir, 'broken.ttf'), Buffer.from('not a font at all'));
    writeFileSync(path.join(dir, 'readme.txt'), 'hello');
    const fonts = await scanFontDirectories([dir, path.join(dir, 'missing')]);
    expect(fonts.map((f) => `${f.family}/${f.style}`)).toEqual(['Alpha/Regular', 'Beta/Italic', 'Gamma/Bold', 'Gamma/Regular']);
    expect(fonts.every((f) => f.path.startsWith(dir))).toBe(true);
  });
});

describe('fontconfig output', () => {
  it('parses files, families and styles, taking the first alias', () => {
    const out = '/usr/share/fonts/a.ttf|Noto Sans,Noto Sans Regular|Regular,Normal\n/usr/share/fonts/b.pcf|Fixed|Regular\n/x/c.otf|Fira|Bold\n/x/c2.otf|Fira|Bold\nbroken line\n';
    expect(parseFcList(out)).toEqual([
      { path: '/x/c.otf', family: 'Fira', style: 'Bold' },
      { path: '/usr/share/fonts/a.ttf', family: 'Noto Sans', style: 'Regular' },
    ]);
  });
});

describe('reading a font', () => {
  it('returns the bytes of a listed font and refuses anything else', async () => {
    const file = path.join(dir, 'a.ttf');
    const list = async () => [{ family: 'Alpha', style: 'Regular', path: file }];
    const bytes = await readListedFont(list, file);
    expect(bytes?.length).toBeGreaterThan(10);
    expect(await readListedFont(list, path.join(dir, 'sub', 'b.otf'))).toBeNull();
    expect(await readListedFont(list, '/etc/passwd')).toBeNull();
    expect(await readListedFont(list, 42)).toBeNull();
  });
});

import { execFile } from 'node:child_process';
import { open, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FontInfo } from './platform/types';

// System fonts (specs/07 · Fuentes): the main process lists them and hands the bytes of one to the
// renderer, which parses it with opentype.js. A file `.vict` never stores a path: fonts are found
// again by family + style on any machine.

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc']);
const MAX_DEPTH = 4;

const u16 = (b: Buffer, o: number) => b.readUInt16BE(o);
const u32 = (b: Buffer, o: number) => b.readUInt32BE(o);

interface NameEntry {
  platform: number;
  /** Windows language id (0x0409 = English US); only meaningful for platform 3. */
  lang: number;
  id: number;
  value: string;
}

/** Strings of a `name` table: UTF-16BE for Windows/Unicode platforms, Latin-1 for the Mac one. */
export function parseNameTable(table: Buffer): NameEntry[] {
  if (table.length < 6) return [];
  const count = u16(table, 2);
  const storage = u16(table, 4);
  const out: NameEntry[] = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12;
    if (at + 12 > table.length) break;
    const platform = u16(table, at);
    const lang = u16(table, at + 4);
    const id = u16(table, at + 6);
    const length = u16(table, at + 8);
    const offset = storage + u16(table, at + 10);
    if (offset + length > table.length) continue;
    const raw = table.subarray(offset, offset + length);
    let value = '';
    if (platform === 3 || platform === 0) for (let k = 0; k + 1 < raw.length; k += 2) value += String.fromCharCode(raw.readUInt16BE(k));
    else value = raw.toString('latin1');
    out.push({ platform, lang, id, value });
  }
  return out;
}

/**
 * Family and style of a font from its name entries: typographic names (16/17) win over the legacy ones (1/2),
 * and English wins over localized ones, so a document made on a Spanish Windows still finds "Bold" on Linux.
 */
export function familyAndStyle(entries: readonly NameEntry[]): { family: string; style: string } | null {
  const pick = (id: number): string | undefined => (entries.find((e) => e.id === id && e.platform === 3 && (e.lang & 0xff) === 0x09) ?? entries.find((e) => e.id === id && e.platform === 3) ?? entries.find((e) => e.id === id))?.value.trim() || undefined;
  const family = pick(16) ?? pick(1);
  if (!family) return null;
  return { family, style: pick(17) ?? pick(2) ?? 'Regular' };
}

/** The `name` table offsets of every face of a font file (one for .ttf/.otf, several for a collection). */
async function readFaces(file: string): Promise<Array<{ family: string; style: string }>> {
  const handle = await open(file, 'r');
  try {
    const head = Buffer.alloc(16);
    await handle.read(head, 0, 16, 0);
    const tag = head.toString('latin1', 0, 4);
    const offsets: number[] = [];
    if (tag === 'ttcf') {
      const n = Math.min(u32(head, 8), 64);
      const list = Buffer.alloc(n * 4);
      await handle.read(list, 0, n * 4, 12);
      for (let i = 0; i < n; i++) offsets.push(u32(list, i * 4));
    } else if (tag === 'OTTO' || u32(head, 0) === 0x00010000 || tag === 'true') {
      offsets.push(0);
    } else {
      return [];
    }
    const faces: Array<{ family: string; style: string }> = [];
    for (const base of offsets) {
      const dirHead = Buffer.alloc(12);
      await handle.read(dirHead, 0, 12, base);
      const tables = u16(dirHead, 4);
      if (tables === 0 || tables > 256) continue;
      const dir = Buffer.alloc(tables * 16);
      await handle.read(dir, 0, tables * 16, base + 12);
      for (let t = 0; t < tables; t++) {
        if (dir.toString('latin1', t * 16, t * 16 + 4) !== 'name') continue;
        const offset = u32(dir, t * 16 + 8);
        const length = Math.min(u32(dir, t * 16 + 12), 1 << 20);
        const table = Buffer.alloc(length);
        await handle.read(table, 0, length, offset);
        const found = familyAndStyle(parseNameTable(table));
        if (found) faces.push(found);
        break;
      }
    }
    return faces;
  } finally {
    await handle.close();
  }
}

async function walk(dir: string, depth: number, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // a directory that does not exist or cannot be read is simply skipped
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && depth < MAX_DEPTH) await walk(full, depth + 1, out);
    else if (entry.isFile() && FONT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
}

/** Fonts found in the given folders, by reading only their `name` tables. */
export async function scanFontDirectories(dirs: readonly string[]): Promise<FontInfo[]> {
  const files: string[] = [];
  for (const dir of dirs) await walk(dir, 0, files);
  const out: FontInfo[] = [];
  // Read a few files at a time: hundreds of tiny reads, not hundreds of whole fonts.
  const batch = 16;
  for (let i = 0; i < files.length; i += batch) {
    const results = await Promise.all(
      files.slice(i, i + batch).map(async (file) => {
        try {
          return (await readFaces(file)).map((face) => ({ ...face, path: file }));
        } catch {
          return [];
        }
      }),
    );
    out.push(...results.flat());
  }
  return dedupe(out);
}

/** One entry per family + style (the same font installed for the user and the system appears once). */
function dedupe(fonts: FontInfo[]): FontInfo[] {
  const seen = new Set<string>();
  const out: FontInfo[] = [];
  for (const f of fonts) {
    const key = `${f.family.toLowerCase()}|${f.style.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out.sort((a, b) => a.family.localeCompare(b.family) || a.style.localeCompare(b.style));
}

/** `fc-list --format '%{file}|%{family}|%{style}\n'`; null when fontconfig is not there. */
export function fcList(): Promise<FontInfo[] | null> {
  return new Promise((resolve) => {
    execFile('fc-list', ['--format', '%{file}|%{family}|%{style}\n'], { maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
      if (error) return resolve(null);
      resolve(parseFcList(stdout));
    });
  });
}

export function parseFcList(stdout: string): FontInfo[] {
  const out: FontInfo[] = [];
  for (const line of stdout.split('\n')) {
    const [file, family, style] = line.split('|');
    if (!file || !family || !FONT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    // fontconfig lists aliases separated by commas ("Noto Sans,Noto Sans Regular"): the first is the family.
    out.push({ path: file, family: (family.split(',')[0] as string).trim(), style: ((style ?? 'Regular').split(',')[0] as string).trim() });
  }
  return dedupe(out);
}

let cache: Promise<FontInfo[]> | null = null;

/** Lists fonts once and remembers the answer (the renderer asks again only on request). */
export function cachedFonts(list: () => Promise<FontInfo[]>): Promise<FontInfo[]> {
  cache ??= list().catch(() => []);
  return cache;
}

/** Bytes of a listed font. Paths that the listing did not produce are refused. */
export async function readListedFont(list: () => Promise<FontInfo[]>, file: unknown): Promise<Uint8Array | null> {
  if (typeof file !== 'string') return null;
  const known = await cachedFonts(list);
  if (!known.some((f) => f.path === file)) return null;
  const buffer = await readFile(file);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

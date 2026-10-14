import type { Color } from '../model/types';

/** One colour of an imported palette. */
export interface PaletteColor {
  name: string;
  color: Color;
  /** ASE colour groups become swatch groups. */
  group?: string;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** GIMP palette (`.gpl`): "R G B Name" lines under a `GIMP Palette` header. Returns [] for anything else. */
export function parseGpl(text: string): PaletteColor[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!/^GIMP Palette/i.test((lines[0] ?? '').trim())) return [];
  const out: PaletteColor[] = [];
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || /^(Name|Columns):/i.test(line)) continue;
    const match = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*(.*)$/.exec(line);
    if (!match) continue;
    const [r, g, b] = [match[1], match[2], match[3]].map((v) => clamp(Number(v), 0, 255)) as [number, number, number];
    out.push({ name: (match[4] ?? '').trim() || `${r} ${g} ${b}`, color: { model: 'rgb', values: [r, g, b] } });
  }
  return out;
}

function labToRgb(l: number, a: number, b: number): [number, number, number] {
  // CIE Lab (D50, as ASE uses) → XYZ → linear sRGB (Bradford-adapted matrix) → gamma.
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const f3 = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const x = 0.9642 * f3(fx);
  const y = 1.0 * f3(fy);
  const z = 0.8249 * f3(fz);
  const lin = [3.1338561 * x - 1.6168667 * y - 0.4906146 * z, -0.9787684 * x + 1.9161415 * y + 0.033454 * z, 0.0719453 * x - 0.2289914 * y + 1.4052427 * z];
  return lin.map((c) => Math.round(clamp(c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055, 0, 1) * 255)) as [number, number, number];
}

/** Adobe Swatch Exchange (`.ase`): colour entries (RGB, CMYK, Gray, Lab), with their groups. Returns [] when it is not an ASE file. */
export function parseAse(bytes: Uint8Array): PaletteColor[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || view.getUint32(0) !== 0x41534546) return [];
  const blocks = view.getUint32(8);
  const out: PaletteColor[] = [];
  let offset = 12;
  const groups: string[] = [];
  const readName = (at: number): { name: string; next: number } => {
    const length = view.getUint16(at);
    let name = '';
    for (let i = 0; i < length - 1; i++) name += String.fromCharCode(view.getUint16(at + 2 + i * 2));
    return { name, next: at + 2 + length * 2 };
  };
  for (let i = 0; i < blocks && offset + 6 <= bytes.byteLength; i++) {
    const type = view.getUint16(offset);
    const length = view.getUint32(offset + 2);
    const body = offset + 6;
    if (type === 0xc001) groups.push(readName(body).name);
    else if (type === 0xc002) groups.pop();
    else if (type === 0x0001) {
      const { name, next } = readName(body);
      const model = String.fromCharCode(view.getUint8(next), view.getUint8(next + 1), view.getUint8(next + 2), view.getUint8(next + 3)).trim();
      const f = (n: number) => view.getFloat32(next + 4 + n * 4);
      let color: Color | null = null;
      if (model === 'RGB') color = { model: 'rgb', values: [f(0), f(1), f(2)].map((v) => Math.round(clamp(v, 0, 1) * 255)) };
      else if (model === 'CMYK') color = { model: 'cmyk', values: [f(0), f(1), f(2), f(3)].map((v) => Math.round(clamp(v, 0, 1) * 1000) / 10) };
      else if (model === 'Gray') color = { model: 'gray', values: [Math.round((1 - clamp(f(0), 0, 1)) * 1000) / 10] };
      else if (model === 'LAB') color = { model: 'rgb', values: labToRgb(f(0) * 100, f(1), f(2)) };
      const group = groups[groups.length - 1];
      if (color) out.push({ name: name || `Color ${out.length + 1}`, color, ...(group ? { group } : {}) });
    }
    offset = body + length;
  }
  return out;
}

/** Detects the format by content. */
export function parsePalette(bytes: Uint8Array): PaletteColor[] {
  const ase = parseAse(bytes);
  if (ase.length > 0) return ase;
  return parseGpl(decodeUtf8(bytes));
}

/** UTF-8 → string without relying on DOM or Node globals (core is pure TypeScript). */
function decodeUtf8(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++] as number;
    if (b < 0x80) out += String.fromCharCode(b);
    else if (b >= 0xc0 && b < 0xe0) out += String.fromCharCode(((b & 0x1f) << 6) | ((bytes[i++] as number) & 0x3f));
    else if (b >= 0xe0 && b < 0xf0) out += String.fromCharCode(((b & 0x0f) << 12) | (((bytes[i++] as number) & 0x3f) << 6) | ((bytes[i++] as number) & 0x3f));
    else if (b >= 0xf0) {
      const cp = ((b & 0x07) << 18) | (((bytes[i++] as number) & 0x3f) << 12) | (((bytes[i++] as number) & 0x3f) << 6) | ((bytes[i++] as number) & 0x3f);
      out += String.fromCodePoint(cp);
    }
  }
  return out;
}

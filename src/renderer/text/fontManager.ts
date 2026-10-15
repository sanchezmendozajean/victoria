import opentype from 'opentype.js';
import { bumpFontEpoch, setFontProvider, type FontFace, type FontProvider, type PathCmd } from '../../core';
import type { SystemFont } from '../../shared/ipc';

// The renderer's side of the text engine: lists the system fonts (main process), loads the ones the
// document uses on demand with opentype.js and registers itself as the core's FontProvider. Fonts
// are found by family + style, never by path (a .vict made on Windows opens on Linux).

const REGULAR = ['regular', 'normal', 'book', 'roman'];

/** Adapts an opentype.js font to the core's `FontFace`. */
export function faceOf(font: opentype.Font): FontFace {
  const cache = new Map<string, { advance: number; commands: PathCmd[] }>();
  const underline = (font.tables as { post?: { underlinePosition?: number; underlineThickness?: number } }).post;
  return {
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
    underlinePosition: underline?.underlinePosition,
    underlineThickness: underline?.underlineThickness,
    has: (ch) => font.charToGlyphIndex(ch) > 0 || /\s/.test(ch),
    glyph(ch) {
      let data = cache.get(ch);
      if (!data) {
        const g = font.charToGlyph(ch);
        // opentype.js commands are in font units with Y up, which is what the core expects.
        data = { advance: g.advanceWidth ?? font.unitsPerEm / 2, commands: g.path.commands.map((c) => ({ ...c }) as unknown as PathCmd) };
        cache.set(ch, data);
      }
      return data;
    },
    kerning(left, right) {
      return font.getKerningValue(font.charToGlyph(left), font.charToGlyph(right)) || 0;
    },
  };
}

export class FontManager implements FontProvider {
  private fonts: SystemFont[] = [];
  private byFamily = new Map<string, SystemFont[]>();
  private faces = new Map<string, FontFace | 'loading' | 'failed'>();
  private listeners = new Set<() => void>();
  private version_ = 0;
  private ready = false;

  constructor(private readonly api: { listFonts(): Promise<SystemFont[]>; readFont(path: string): Promise<Uint8Array | null> }) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getVersion = (): number => this.version_;
  private changed(): void {
    this.version_++;
    this.listeners.forEach((l) => l());
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Lists the system fonts and registers this manager as the core's provider. */
  async init(): Promise<void> {
    const list = await this.api.listFonts().catch(() => []);
    this.fonts = list;
    this.byFamily.clear();
    for (const f of list) {
      const key = f.family.toLowerCase();
      const group = this.byFamily.get(key) ?? [];
      group.push(f);
      this.byFamily.set(key, group);
    }
    this.ready = true;
    setFontProvider(this);
    this.changed();
  }

  families(): string[] {
    const names = new Map<string, string>();
    for (const f of this.fonts) names.set(f.family.toLowerCase(), f.family);
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }

  stylesOf(family: string): string[] {
    return (this.byFamily.get(family.toLowerCase()) ?? []).map((f) => f.style);
  }

  hasFamily(family: string): boolean {
    return this.byFamily.has(family.toLowerCase());
  }

  /** The family used for new text: the first common one that is installed. */
  defaultFamily(): string {
    for (const candidate of ['Arial', 'Helvetica', 'Liberation Sans', 'DejaVu Sans', 'Noto Sans', 'Segoe UI', 'Ubuntu']) if (this.hasFamily(candidate)) return candidate;
    return this.families()[0] ?? 'Arial';
  }

  /** The installed face that best matches a style name: exact, then a regular one, then the first. */
  match(family: string, style: string): SystemFont | null {
    const group = this.byFamily.get(family.toLowerCase());
    if (!group || group.length === 0) return null;
    const wanted = style.toLowerCase();
    return group.find((f) => f.style.toLowerCase() === wanted) ?? group.find((f) => REGULAR.includes(f.style.toLowerCase())) ?? (group[0] as SystemFont);
  }

  resolve(family: string, style: string): FontFace | null {
    const hit = this.match(family, style);
    if (!hit) return null;
    const known = this.faces.get(hit.path);
    if (known && known !== 'loading' && known !== 'failed') return known;
    if (!known) void this.load(hit);
    return null;
  }

  private async load(font: SystemFont): Promise<void> {
    this.faces.set(font.path, 'loading');
    try {
      const bytes = await this.api.readFont(font.path);
      if (!bytes) throw new Error('unreadable');
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      this.faces.set(font.path, faceOf(opentype.parse(buffer)));
      bumpFontEpoch();
      this.changed();
    } catch {
      this.faces.set(font.path, 'failed');
    }
  }

  /** Waits until a face is loaded (tests, and before exporting). */
  async ensure(family: string, style: string): Promise<boolean> {
    const hit = this.match(family, style);
    if (!hit) return false;
    if (!this.faces.has(hit.path)) await this.load(hit);
    return this.faces.get(hit.path) instanceof Object;
  }
}

export const fontManager = new FontManager({
  listFonts: () => window.victoria.listFonts(),
  readFont: (path) => window.victoria.readFont(path),
});

import { IDENTITY, multiply, rotation, scaling, translation } from '../../model/matrix';
import type { Matrix } from '../../model/types';

// Colours, lengths, transforms and CSS as SVG writes them.

const NAMES =
  'aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 grey:808080 green:008000 greenyellow:adff2f honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32';

const NAMED_COLORS = new Map<string, [number, number, number]>(
  NAMES.split(' ').map((entry) => {
    const [name, hex] = entry.split(':') as [string, string];
    return [name, [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)]];
  }),
);

export interface ParsedColor {
  rgb: [number, number, number];
  alpha: number;
}

export type ColorValue = ParsedColor | 'none' | 'currentColor';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = (((h % 360) + 360) % 360) / 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hue * 12) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

/** `none`, `currentColor`, a colour, or null when the text is not one (a `url(#…)` paint is handled by the caller). */
export function parseColor(text: string): ColorValue | null {
  const value = text.trim().toLowerCase();
  if (value === 'none') return 'none';
  if (value === 'currentcolor') return 'currentColor';
  if (value === 'transparent') return { rgb: [0, 0, 0], alpha: 0 };
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value);
  if (hex) {
    let h = hex[1] as string;
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    return {
      rgb: [Number.parseInt(h.slice(0, 2), 16), Number.parseInt(h.slice(2, 4), 16), Number.parseInt(h.slice(4, 6), 16)],
      alpha: h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(value);
  if (fn) {
    const parts = (fn[2] as string).split(/[\s,/]+/).filter((p) => p.length > 0);
    if (parts.length < 3) return null;
    const num = (p: string, scale: number) => (p.endsWith('%') ? (Number.parseFloat(p) / 100) * scale : Number.parseFloat(p));
    const alphaPart = parts[3];
    const alpha = alphaPart === undefined ? 1 : clamp(alphaPart.endsWith('%') ? Number.parseFloat(alphaPart) / 100 : Number.parseFloat(alphaPart), 0, 1);
    if (fn[1]?.startsWith('rgb')) {
      const rgb = [num(parts[0] as string, 255), num(parts[1] as string, 255), num(parts[2] as string, 255)].map((v) => clamp(Math.round(v), 0, 255)) as [number, number, number];
      return rgb.every(Number.isFinite) ? { rgb, alpha } : null;
    }
    const h = Number.parseFloat(parts[0] as string);
    const s = clamp(Number.parseFloat(parts[1] as string) / 100, 0, 1);
    const l = clamp(Number.parseFloat(parts[2] as string) / 100, 0, 1);
    return [h, s, l].every(Number.isFinite) ? { rgb: hslToRgb(h, s, l).map(Math.round) as [number, number, number], alpha } : null;
  }
  const named = NAMED_COLORS.get(value);
  return named ? { rgb: [...named], alpha: 1 } : null;
}

// ── Lengths ─────────────────────────────────────────────────────────────────────

const UNIT_PX: Record<string, number> = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, pt: 96 / 72, pc: 16 };

export interface Length {
  value: number;
  unit: string;
}

export function splitLength(text: string | undefined): Length | null {
  if (text === undefined) return null;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(px|in|cm|mm|q|pt|pc|em|ex|rem|%)?\s*$/i.exec(text);
  return m ? { value: Number(m[1]), unit: (m[2] ?? '').toLowerCase() } : null;
}

/** A length in user units (CSS px). `reference` is what a percentage refers to. Null when unreadable. */
export function toUserUnits(text: string | undefined, reference: number, fontSize = 16): number | null {
  const l = splitLength(text);
  if (!l) return null;
  if (l.unit === '' || l.unit === 'px') return l.value;
  if (l.unit === '%') return (l.value / 100) * reference;
  if (l.unit === 'em' || l.unit === 'rem') return l.value * fontSize;
  if (l.unit === 'ex') return l.value * fontSize * 0.5;
  return l.value * (UNIT_PX[l.unit] ?? 1);
}

export const isPhysicalUnit = (unit: string): boolean => unit in UNIT_PX && unit !== 'px';

/** Space- or comma-separated numbers. */
export function numberList(text: string | undefined): number[] {
  if (!text) return [];
  return text
    .split(/[\s,]+/)
    .filter((p) => p.length > 0)
    .map(Number)
    .filter(Number.isFinite);
}

// ── Transforms ──────────────────────────────────────────────────────────────────

/** `translate(10 20) rotate(45 5 5) scale(2)`… as one matrix; null when the list is malformed. */
export function parseTransform(text: string | undefined): Matrix | null {
  if (!text || /^\s*$/.test(text)) return [...IDENTITY];
  let m: Matrix = [...IDENTITY];
  const re = /\s*,?\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gy;
  let end = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    end = re.lastIndex;
    const a = numberList(match[2]);
    let t: Matrix | null = null;
    switch (match[1]) {
      case 'matrix':
        if (a.length === 6) t = a as unknown as Matrix;
        break;
      case 'translate':
        if (a.length >= 1) t = translation(a[0] as number, a[1] ?? 0);
        break;
      case 'scale':
        if (a.length >= 1) t = scaling(a[0] as number, a[1] ?? (a[0] as number));
        break;
      case 'rotate':
        if (a.length === 1 || a.length === 3) {
          const r = rotation(((a[0] as number) * Math.PI) / 180);
          t = a.length === 3 ? multiply(translation(a[1] as number, a[2] as number), multiply(r, translation(-(a[1] as number), -(a[2] as number)))) : r;
        }
        break;
      case 'skewX':
        if (a.length === 1) t = [1, 0, Math.tan(((a[0] as number) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        if (a.length === 1) t = [1, Math.tan(((a[0] as number) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    if (!t) return null;
    m = multiply(m, t);
  }
  return /^\s*,?\s*$/.test(text.slice(end)) ? m : null;
}

// ── CSS ─────────────────────────────────────────────────────────────────────────

export function parseDeclarations(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(';')) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    const value = part
      .slice(colon + 1)
      .replace(/!important\s*$/i, '')
      .trim();
    if (key && value) out[key] = value;
  }
  return out;
}

export interface CssRule {
  selector: { tag: string | null; id: string | null; classes: string[] };
  declarations: Record<string, string>;
  /** Higher wins: id > class > tag. */
  specificity: number;
}

/** Only simple selectors (`tag`, `.class`, `#id`, `tag.class`, `*`, comma lists). Rules with combinators or pseudo-classes are skipped. */
export function parseStylesheet(css: string): { rules: CssRule[]; skipped: number } {
  const rules: CssRule[] = [];
  let skipped = 0;
  // Comments and at-rules (@media, @font-face…) with their blocks are not styles for the drawing.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@[^{;]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    const declarations = parseDeclarations(m[2] as string);
    for (const raw of (m[1] as string).split(',')) {
      const text = raw.trim();
      const parts = /^(\*|[a-zA-Z][\w-]*)?((?:\.[\w-]+)*)(#[\w-]+)?$/.exec(text);
      if (!parts || text === '') {
        skipped++;
        continue;
      }
      const tag = parts[1] && parts[1] !== '*' ? parts[1] : null;
      const classes = (parts[2] ?? '').split('.').filter((c) => c.length > 0);
      const id = parts[3] ? parts[3].slice(1) : null;
      rules.push({ selector: { tag, id, classes }, declarations, specificity: (id ? 100 : 0) + classes.length * 10 + (tag ? 1 : 0) });
    }
  }
  return { rules, skipped };
}

export function ruleMatches(rule: CssRule, tag: string, id: string | undefined, classes: readonly string[]): boolean {
  const s = rule.selector;
  return (s.tag === null || s.tag === tag) && (s.id === null || s.id === id) && s.classes.every((c) => classes.includes(c));
}

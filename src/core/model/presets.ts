import type { Bleed } from './types';

/** Millimetres → points. The only unit constant the core needs (artboard presets are defined in pt). */
const mm = (value: number) => Math.round(((value * 72) / 25.4) * 1000) / 1000;
const inch = (value: number) => value * 72;

export interface ArtboardPreset {
  /** Stable id stored in `Artboard.preset`; the UI translates it. */
  id: string;
  w: number;
  h: number;
}

/** specs/04 · Presets incluidos. 1 px = 1 pt (72 ppi), as in Illustrator. */
export const ARTBOARD_PRESETS: readonly ArtboardPreset[] = [
  { id: 'A3', w: mm(297), h: mm(420) },
  { id: 'A4', w: mm(210), h: mm(297) },
  { id: 'A5', w: mm(148), h: mm(210) },
  { id: 'Carta', w: inch(8.5), h: inch(11) },
  { id: 'Oficio', w: inch(8.5), h: inch(14) },
  { id: 'Tabloide', w: inch(11), h: inch(17) },
  { id: '10x15', w: mm(100), h: mm(150) },
  { id: '13x18', w: mm(130), h: mm(180) },
  { id: 'Tarjeta', w: mm(90), h: mm(50) },
  ...[16, 24, 32, 48, 64, 128, 256, 512].map((n) => ({ id: `Icono ${n}`, w: n, h: n })),
  { id: 'Instagram', w: 1080, h: 1080 },
  { id: 'Historia', w: 1080, h: 1920 },
  { id: 'Pantalla', w: 1920, h: 1080 },
];

export function findPreset(id: string): ArtboardPreset | undefined {
  return ARTBOARD_PRESETS.find((p) => p.id === id);
}

export const NO_BLEED: Bleed = { top: 0, right: 0, bottom: 0, left: 0 };

/** Label colours of Spaces (specs/10 · --space-colors). Same in both themes. */
export const SPACE_COLORS: readonly string[] = [
  '#4C8DFF',
  '#3FB97A',
  '#F2B33D',
  '#F0524F',
  '#A77BFF',
  '#2EC4C9',
  '#FF8A3D',
  '#9AA0A6',
];

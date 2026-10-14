import type { Color } from '../../core';

export interface LibrarySwatch {
  name: string;
  color: Color;
  group: string;
}

const rgb = (r: number, g: number, b: number): Color => ({ model: 'rgb', values: [r, g, b] });

/** The basic library (specs/06 · Muestras: «biblioteca básica incluida»): primaries, grays and a friendly set of tones. */
export const BASIC_LIBRARY: LibrarySwatch[] = [
  { name: 'Negro', color: rgb(0, 0, 0), group: 'Básicos' },
  { name: 'Blanco', color: rgb(255, 255, 255), group: 'Básicos' },
  { name: 'Rojo', color: rgb(255, 0, 0), group: 'Básicos' },
  { name: 'Amarillo', color: rgb(255, 255, 0), group: 'Básicos' },
  { name: 'Verde', color: rgb(0, 255, 0), group: 'Básicos' },
  { name: 'Cian', color: rgb(0, 255, 255), group: 'Básicos' },
  { name: 'Azul', color: rgb(0, 0, 255), group: 'Básicos' },
  { name: 'Magenta', color: rgb(255, 0, 255), group: 'Básicos' },
  ...[10, 20, 30, 40, 50, 60, 70, 80, 90].map((k): LibrarySwatch => {
    const v = Math.round(255 * (1 - k / 100));
    return { name: `Gris ${k} %`, color: rgb(v, v, v), group: 'Grises' };
  }),
  { name: 'Coral', color: rgb(240, 82, 79), group: 'Tonos' },
  { name: 'Naranja', color: rgb(255, 138, 61), group: 'Tonos' },
  { name: 'Ámbar', color: rgb(242, 179, 61), group: 'Tonos' },
  { name: 'Lima', color: rgb(167, 214, 70), group: 'Tonos' },
  { name: 'Esmeralda', color: rgb(63, 185, 122), group: 'Tonos' },
  { name: 'Turquesa', color: rgb(46, 196, 201), group: 'Tonos' },
  { name: 'Azul cielo', color: rgb(76, 141, 255), group: 'Tonos' },
  { name: 'Índigo', color: rgb(73, 80, 180), group: 'Tonos' },
  { name: 'Violeta', color: rgb(167, 123, 255), group: 'Tonos' },
  { name: 'Rosa', color: rgb(255, 120, 180), group: 'Tonos' },
  { name: 'Café', color: rgb(120, 78, 52), group: 'Tonos' },
  { name: 'Arena', color: rgb(224, 205, 170), group: 'Tonos' },
];

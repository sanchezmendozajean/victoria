import { hexToColor } from '../model/color';
import type { Color } from '../model/types';
import type { ModifierDef, Params } from './types';
import { num } from './util';

// Stylize: appearance modifiers. They do not change geometry; they describe a shadow or a glow that the
// renderer paints with the object (canvas shadow, an SVG filter on export).

const color = (params: Params, key: string, fallback: Color): Color => (typeof params[key] === 'string' ? (hexToColor(params[key] as string) ?? fallback) : fallback);

export const dropShadow: ModifierDef = {
  id: 'drop-shadow',
  icon: 'drop-shadow',
  category: 'stylize',
  affectsGeometry: false,
  defaults: { mode: 'multiply', opacity: 75, dx: 5, dy: 5, blur: 5, color: '#000000' },
  schema: [
    { type: 'select', key: 'mode', options: ['normal', 'multiply'] },
    { type: 'number', key: 'opacity', unit: 'percent', min: 0, max: 100, step: 1, decimals: 0, slider: true },
    { type: 'number', key: 'dx', unit: 'length', step: 1, decimals: 2 },
    { type: 'number', key: 'dy', unit: 'length', step: 1, decimals: 2 },
    { type: 'number', key: 'blur', unit: 'length', min: 0, step: 1, decimals: 2 },
    { type: 'color', key: 'color' },
  ],
  apply(_input, params) {
    return { effect: { type: 'shadow', color: color(params, 'color', { model: 'rgb', values: [0, 0, 0] }), opacity: num(params, 'opacity', 75) / 100, dx: num(params, 'dx', 5), dy: num(params, 'dy', 5), blur: Math.max(0, num(params, 'blur', 5)) } };
  },
};

export const outerGlow: ModifierDef = {
  id: 'outer-glow',
  icon: 'outer-glow',
  category: 'stylize',
  affectsGeometry: false,
  defaults: { mode: 'screen', color: '#ffe066', opacity: 75, blur: 8 },
  schema: [
    { type: 'color', key: 'color' },
    { type: 'number', key: 'opacity', unit: 'percent', min: 0, max: 100, step: 1, decimals: 0, slider: true },
    { type: 'number', key: 'blur', unit: 'length', min: 0, step: 1, decimals: 2 },
  ],
  apply(_input, params) {
    return { effect: { type: 'glow', color: color(params, 'color', { model: 'rgb', values: [255, 224, 102] }), opacity: num(params, 'opacity', 75) / 100, blur: Math.max(0, num(params, 'blur', 8)) } };
  },
};

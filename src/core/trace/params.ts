/** Settings of Calco de imagen (specs/08). */
export interface TraceParams {
  mode: 'color' | 'gray' | 'bw';
  /** Colours of the palette, 2-30 (colour and grey modes). */
  colors: number;
  /** 0-255: darker than this is black (black and white mode). */
  threshold: number;
  /** Areas smaller than this many pixels are dropped (despeckle). */
  noise: number;
  /** 0-100: how readily a bend becomes a sharp corner instead of a curve. */
  corners: number;
  /** Pixels a path may stray from the picture's edge; larger = fewer anchors. */
  tolerance: number;
  /** `overlapping`: colours stack on each other (no gaps); `abutting`: every region only holds its own pixels. */
  method: 'overlapping' | 'abutting';
  /** Do not trace white (the paper). */
  ignoreWhite: boolean;
}

export const DEFAULT_TRACE: TraceParams = {
  mode: 'color',
  colors: 16,
  threshold: 128,
  noise: 4,
  corners: 50,
  tolerance: 1,
  method: 'overlapping',
  ignoreWhite: true,
};

export type TracePresetId = 'high' | 'low' | 'colors3' | 'colors6' | 'colors16' | 'grays' | 'bw' | 'silhouette' | 'lineart' | 'technical' | 'logo';

export const TRACE_PRESETS: Record<TracePresetId, Partial<TraceParams>> = {
  high: { mode: 'color', colors: 30, noise: 2, corners: 50, tolerance: 0.7, ignoreWhite: false },
  low: { mode: 'color', colors: 8, noise: 12, corners: 50, tolerance: 1.5, ignoreWhite: false },
  colors3: { mode: 'color', colors: 3, noise: 8, tolerance: 1.2, ignoreWhite: false },
  colors6: { mode: 'color', colors: 6, noise: 8, tolerance: 1.2, ignoreWhite: false },
  colors16: { mode: 'color', colors: 16, noise: 4, tolerance: 1, ignoreWhite: false },
  grays: { mode: 'gray', colors: 8, noise: 6, tolerance: 1, ignoreWhite: false },
  bw: { mode: 'bw', threshold: 128, noise: 4, corners: 50, tolerance: 1, ignoreWhite: true },
  silhouette: { mode: 'bw', threshold: 160, noise: 30, corners: 30, tolerance: 2, ignoreWhite: true },
  lineart: { mode: 'bw', threshold: 190, noise: 2, corners: 70, tolerance: 0.8, ignoreWhite: true },
  technical: { mode: 'bw', threshold: 170, noise: 2, corners: 90, tolerance: 0.7, ignoreWhite: true },
  logo: { mode: 'color', colors: 6, noise: 10, corners: 75, tolerance: 1, ignoreWhite: true },
};

export const paramsForPreset = (id: TracePresetId): TraceParams => ({ ...DEFAULT_TRACE, ...TRACE_PRESETS[id] });

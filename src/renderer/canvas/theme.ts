/** Colours the canvas needs, read from the CSS tokens so both themes work (specs/10 · Temas). */
export interface CanvasTheme {
  canvas: string;
  artboard: string;
  artboardBorder: string;
  artboardBorderActive: string;
  label: string;
  labelActive: string;
  bleed: string;
  grid: string;
  gridMinor: string;
  guide: string;
  accent: string;
  smartGuide: string;
  rulerBg: string;
  rulerBorder: string;
  rulerText: string;
  accentSoft: string;
}

export function readCanvasTheme(root: HTMLElement = document.documentElement): CanvasTheme {
  const css = getComputedStyle(root);
  const token = (name: string) => css.getPropertyValue(name).trim();
  const dark = root.dataset.theme !== 'light';
  return {
    canvas: token('--canvas'),
    artboard: token('--artboard'),
    artboardBorder: dark ? '#7a7d83' : '#9a9ea5',
    artboardBorderActive: '#000000',
    label: token('--text-muted'),
    labelActive: token('--text'),
    bleed: token('--danger'),
    // Mid-grey with alpha: visible over both the white sheet and the canvas colour, in either theme.
    grid: 'rgba(128,128,128,0.55)',
    gridMinor: 'rgba(128,128,128,0.25)',
    guide: token('--space-6'),
    accent: token('--accent'),
    smartGuide: token('--smart-guide'),
    rulerBg: token('--bg-panel'),
    rulerBorder: token('--border'),
    rulerText: token('--text-muted'),
    accentSoft: token('--accent-soft'),
  };
}

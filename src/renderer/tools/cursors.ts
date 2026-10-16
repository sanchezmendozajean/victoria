/** Curved double arrow shown just outside the bounding-box corners (rotate). */
const ROTATE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'>" +
  "<path d='M5 15a8 8 0 0 1 14 0' stroke='white' stroke-width='4'/><path d='M3 14l2 4 4-2M21 14l-2 4-4-2' stroke='white' stroke-width='4'/>" +
  "<path d='M5 15a8 8 0 0 1 14 0' stroke='black' stroke-width='1.6'/><path d='M3 14l2 4 4-2M21 14l-2 4-4-2' stroke='black' stroke-width='1.6'/></svg>";

export const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(ROTATE_SVG)}") 12 12, crosshair`;

export type PenBadge = 'new' | 'continue' | 'close' | 'add' | 'delete' | 'convert' | 'none';

const BADGES: Record<PenBadge, string> = {
  none: '',
  new: "<path d='M20 5v8M16.5 7l7 4M23.5 7l-7 4'/>",
  continue: "<path d='M17 14l6-9'/>",
  close: "<circle cx='20' cy='9' r='3.2'/>",
  add: "<path d='M20 5v8M16 9h8'/>",
  delete: "<path d='M16 9h8'/>",
  convert: "<path d='M16.5 12l3.5-7 3.5 7'/>",
};

const NIB = "<path d='M3 25l2-8 8-5 3 3-5 8z M5 17l4 4'/>";

/** Pen-nib cursors of the Pen family (specs/03 · Pluma · 11): the badge says what a click will do. Tip at the lower left. */
export function penCursor(badge: PenBadge): string {
  const layer = (stroke: string, width: number) =>
    `<g stroke='${stroke}' stroke-width='${width}' fill='none' stroke-linecap='round' stroke-linejoin='round'>${NIB}${BADGES[badge]}</g>`;
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>" + layer('white', 4) + layer('black', 1.5) + '</svg>';
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 3 25, crosshair`;
}

/** Arrow with a badge: "+" merges regions (click or drag), "−" deletes them (Alt). Tip at the upper left. */
export function shapeBuilderCursor(mode: 'merge' | 'delete'): string {
  const arrow = "<path d='M4 3l0 15 4-4 3 7 3-1.5-3-6.5 6 0z'/>";
  const badge = mode === 'merge' ? "<path d='M20 6v8M16 10h8'/>" : "<path d='M16 10h8'/>";
  const layer = (stroke: string, width: number) => `<g stroke='${stroke}' stroke-width='${width}' fill='${stroke === 'black' ? 'white' : 'none'}' stroke-linecap='round' stroke-linejoin='round'>${arrow}${badge}</g>`;
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>" + layer('white', 4) + layer('black', 1.4) + '</svg>';
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 3, crosshair`;
}

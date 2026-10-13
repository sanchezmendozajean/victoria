/** Curved double arrow shown just outside the bounding-box corners (rotate). */
const ROTATE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'>" +
  "<path d='M5 15a8 8 0 0 1 14 0' stroke='white' stroke-width='4'/><path d='M3 14l2 4 4-2M21 14l-2 4-4-2' stroke='white' stroke-width='4'/>" +
  "<path d='M5 15a8 8 0 0 1 14 0' stroke='black' stroke-width='1.6'/><path d='M3 14l2 4 4-2M21 14l-2 4-4-2' stroke='black' stroke-width='1.6'/></svg>";

export const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(ROTATE_SVG)}") 12 12, crosshair`;

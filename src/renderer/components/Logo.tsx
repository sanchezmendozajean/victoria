interface LogoProps {
  size?: number;
}

/**
 * The app mark, as in the application icon (design/Icono para la app): a "V" of two segments whose ends and
 * vertex are square anchors, with a handle to the right. Drawn in `currentColor` so it follows the theme.
 */
export function Logo({ size = 16 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M100 100 256 412M412 100 256 412M256 412h156" fill="none" stroke="currentColor" strokeWidth="36" />
      <rect x="60" y="60" width="80" height="80" />
      <rect x="372" y="60" width="80" height="80" />
      <rect x="216" y="372" width="80" height="80" />
      <rect x="372" y="372" width="80" height="80" />
    </svg>
  );
}

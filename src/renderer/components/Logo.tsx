interface LogoProps {
  size?: number;
}

/** Provisional logo: a "V" of two segments with a square node at the vertex and a handle (specs/10 · Identidad). */
export function Logo({ size = 16 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M2.5 2.5 8 12.5 13.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 12.5h5.5" stroke="currentColor" strokeWidth="1" />
      <circle cx="13.75" cy="12.5" r="1.4" fill="currentColor" />
      <rect x="6.25" y="10.75" width="3.5" height="3.5" fill="currentColor" />
    </svg>
  );
}

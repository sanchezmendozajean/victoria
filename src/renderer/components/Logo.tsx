interface LogoProps {
  size?: number;
}

/** The app icon (design/Icono para la app/Icono.svg): black rounded tile with the blue "V" glyph. */
export function Logo({ size = 16 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 224.42 224.42" aria-hidden="true" focusable="false">
      <path
        d="M0 38.511C0 17.242 17.242 0 38.511 0H183.292C204.561 0 221.803 17.242 221.803 38.511V185.973C221.803 207.242 204.561 224.484 183.292 224.484H38.511C17.242 224.484 0 207.242 0 185.973Z"
        fill="#000"
      />
      <path
        transform="translate(-160.73 -332.214)"
        d="M187.074 358.561H221.986V393.473H218.574L269.554 495.375H276.39L327.317 393.473H323.895V358.561H358.807V393.473H337.937L287.01 495.375H290.397V508.081H323.895V495.375H358.807V530.288H323.895V517.581H290.397V530.288H255.484V495.375H258.932L207.952 393.473H187.074Z"
        fill="#29adff"
      />
    </svg>
  );
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 of the bytes (the core has no DOM, so no btoa). */
export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    parts.push(
      ALPHABET.charAt((n >> 18) & 63) + ALPHABET.charAt((n >> 12) & 63) + (b === undefined ? '=' : ALPHABET.charAt((n >> 6) & 63)) + (c === undefined ? '=' : ALPHABET.charAt(n & 63)),
    );
  }
  return parts.join('');
}

const LOOKUP = new Map([...ALPHABET].map((ch, i) => [ch, i] as const));

/** The bytes of a base64 text (whitespace and URL-safe characters tolerated). Null when it contains anything else. */
export function fromBase64(text: string): Uint8Array | null {
  const clean = text.replace(/[\s=]+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (clean.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    let n = 0;
    let count = 0;
    for (let k = 0; k < 4 && i + k < clean.length; k++) {
      const v = LOOKUP.get(clean.charAt(i + k));
      if (v === undefined) return null;
      n = (n << 6) | v;
      count++;
    }
    n <<= 6 * (4 - count);
    if (count >= 2) out[o++] = (n >> 16) & 255;
    if (count >= 3) out[o++] = (n >> 8) & 255;
    if (count === 4) out[o++] = n & 255;
  }
  return out.slice(0, o);
}

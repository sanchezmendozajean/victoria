// Resolution metadata written into exported pictures, so that re-importing them (here or elsewhere) gives the intended size.

let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = (crcTable[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const u32 = (value: number): number[] => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const ascii = (b: Uint8Array, i: number, count: number) => String.fromCharCode(...b.subarray(i, i + count));
const beU32 = (b: Uint8Array, i: number) => ((b[i] as number) * 16777216 + ((b[i + 1] as number) << 16) + ((b[i + 2] as number) << 8) + (b[i + 3] as number)) >>> 0;

/** The PNG with a `pHYs` chunk of `dpi` pixels per inch (an existing one is replaced). Returns the input if it is not a PNG. */
export function withPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (png.length < 33 || png[0] !== 0x89 || ascii(png, 1, 3) !== 'PNG' || !(dpi > 0)) return png;
  const perMetre = Math.round(dpi / 0.0254);
  const body = [...u32(perMetre), ...u32(perMetre), 1];
  const type = [0x70, 0x48, 0x59, 0x73]; // pHYs
  const chunk = Uint8Array.from([...u32(9), ...type, ...body, ...u32(crc32(Uint8Array.from([...type, ...body])))]);
  const pieces: Uint8Array[] = [png.subarray(0, 8)];
  let inserted = false;
  for (let i = 8; i + 12 <= png.length; ) {
    const length = beU32(png, i);
    const kind = ascii(png, i + 4, 4);
    const end = i + 12 + length;
    if (kind === 'pHYs') {
      i = end;
      continue;
    }
    if (!inserted && (kind === 'IDAT' || kind === 'IEND')) {
      pieces.push(chunk);
      inserted = true;
    }
    pieces.push(png.subarray(i, end));
    i = end;
  }
  const out = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of pieces) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** The JPEG with its JFIF density set to `dpi`. Returns the input when there is no JFIF header (nothing is added). */
export function withJpegDpi(jpeg: Uint8Array, dpi: number): Uint8Array {
  if (jpeg.length < 20 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || !(dpi > 0)) return jpeg;
  const out = jpeg.slice();
  // The JFIF segment comes right after SOI: FF E0 len len 'JFIF' 00 vMaj vMin units xDen xDen yDen yDen.
  if (out[2] !== 0xff || out[3] !== 0xe0 || ascii(out, 6, 4) !== 'JFIF') return jpeg;
  const density = Math.min(65535, Math.round(dpi));
  out[13] = 1; // dots per inch
  out[14] = density >> 8;
  out[15] = density & 255;
  out[16] = density >> 8;
  out[17] = density & 255;
  return out;
}

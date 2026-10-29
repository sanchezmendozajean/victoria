import type { PixelWindow } from '../../core';

/** The pixels of `window` cut out of a picture, as a PNG (lossless, so a cut never degrades what is left). */
export async function cropPicture(bytes: Uint8Array, window: Pick<PixelWindow, 'sx' | 'sy' | 'sw' | 'sh'>): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
  try {
    const canvas = new OffscreenCanvas(window.sw, window.sh);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    ctx.drawImage(bitmap, window.sx, window.sy, window.sw, window.sh, 0, 0, window.sw, window.sh);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

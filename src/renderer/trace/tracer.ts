import type { Pixels, TraceParams, TraceResult } from '../../core';
import type { TraceMessage, TraceRequest } from './traceWorker';

/** Pictures larger than this (longest side, px) are traced from a reduced copy; the paths are scaled back. */
export const MAX_TRACE_SIDE = 1600;

/** The pixels of a picture file, reduced to at most `MAX_TRACE_SIDE`. Transparent areas stay transparent. */
export async function decodePixels(bytes: Uint8Array): Promise<Pixels & { data: Uint8ClampedArray }> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
  try {
    const scale = Math.min(1, MAX_TRACE_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No 2D context');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    return { width, height, data: ctx.getImageData(0, 0, width, height).data };
  } finally {
    bitmap.close();
  }
}

export interface TraceJob {
  result: Promise<TraceResult>;
  /** Stops the work; `result` rejects with an error named "Cancelled". */
  cancel(): void;
}

/** Runs the tracer in a Web Worker, reporting progress (0-1). */
export function runTrace(pixels: Pixels & { data: Uint8ClampedArray }, params: TraceParams, onProgress: (value: number) => void): TraceJob {
  const worker = new Worker(new URL('./traceWorker.ts', import.meta.url), { type: 'module' });
  let fail: (reason: Error) => void = () => undefined;
  const result = new Promise<TraceResult>((resolve, reject) => {
    fail = reject;
    worker.onmessage = (event: MessageEvent<TraceMessage>) => {
      const message = event.data;
      if (message.type === 'progress') onProgress(message.value);
      else {
        worker.terminate();
        if (message.type === 'done') resolve(message.result);
        else reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Worker failed'));
    };
    const request: TraceRequest = { width: pixels.width, height: pixels.height, data: pixels.data, params };
    worker.postMessage(request, [pixels.data.buffer]);
  });
  return {
    result,
    cancel: () => {
      worker.terminate();
      const error = new Error('Cancelled');
      error.name = 'Cancelled';
      fail(error);
    },
  };
}

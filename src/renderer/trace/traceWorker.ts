import { traceImage, type TraceParams, type TraceResult } from '../../core/trace';

/** Messages between the interface and the worker that runs Calco de imagen off the main thread. */
export interface TraceRequest {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  params: TraceParams;
}
export type TraceMessage = { type: 'progress'; value: number } | { type: 'done'; result: TraceResult } | { type: 'error'; message: string };

self.onmessage = (event: MessageEvent<TraceRequest>) => {
  const { width, height, data, params } = event.data;
  const post = (message: TraceMessage) => (self as unknown as { postMessage(m: TraceMessage): void }).postMessage(message);
  try {
    const result = traceImage({ width, height, data }, params, { progress: (value) => post({ type: 'progress', value }) });
    post({ type: 'done', result });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

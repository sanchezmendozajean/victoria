import type { ComputedPieces, Operand, PathfinderOp } from '../../core';
import type { BooleanMessage, BooleanRequest } from './booleanWorker';

export interface BooleanJob {
  result: Promise<ComputedPieces>;
  /** Stops the work at once; `result` rejects with an error named "Cancelled". */
  cancel(): void;
}

/** Runs the geometry engine of one Buscatrazos operation in a Web Worker. */
export function runBooleans(op: PathfinderOp, operands: Operand[]): BooleanJob {
  const worker = new Worker(new URL('./booleanWorker.ts', import.meta.url), { type: 'module' });
  let fail: (reason: Error) => void = () => undefined;
  const result = new Promise<ComputedPieces>((resolve, reject) => {
    fail = reject;
    worker.onmessage = (event: MessageEvent<BooleanMessage>) => {
      worker.terminate();
      if (event.data.type === 'done') resolve(event.data.result);
      else reject(new Error(event.data.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Worker failed'));
    };
    const request: BooleanRequest = { op, operands };
    worker.postMessage(request);
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

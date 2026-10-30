import { computePieces, type ComputedPieces, type Operand, type PathfinderOp } from '../../core';

/** Messages between the interface and the Worker that runs the geometry engine of the Buscatrazos. */
export interface BooleanRequest {
  op: PathfinderOp;
  operands: Operand[];
}
export type BooleanMessage = { type: 'done'; result: ComputedPieces } | { type: 'error'; message: string };

self.onmessage = (event: MessageEvent<BooleanRequest>) => {
  const post = (message: BooleanMessage) => (self as unknown as { postMessage(m: BooleanMessage): void }).postMessage(message);
  try {
    post({ type: 'done', result: computePieces(event.data.op, event.data.operands) });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

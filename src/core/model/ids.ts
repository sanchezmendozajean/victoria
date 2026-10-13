import { nanoid } from 'nanoid';

/** Produces unique ids. Injectable so tests and replays are deterministic. */
export type IdGenerator = () => string;

export const randomIds: IdGenerator = () => nanoid(12);

/** Deterministic ids: "id-1", "id-2", … */
export function sequentialIds(prefix = 'id'): IdGenerator {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

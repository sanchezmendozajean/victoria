import { describe, expect, it } from 'vitest';
import { assertDocument } from '../io/validate';
import { collectIds } from '../model/queries';
import type { Document } from '../model/types';
import { createRng, randomCommand, sampleDocument, sequentialIds } from '../testing/random-ops';
import { DocumentSession } from './session';

/** Ignores which Space is in front: undo legitimately brings the undone action's Space to the front (specs/04 · regla 4). */
const content = (doc: Document) => ({ ...doc, activeSpaceId: '' });

function assertInvariants(doc: Document): void {
  assertDocument(JSON.parse(JSON.stringify(doc)));
  const ids = collectIds(doc);
  expect(new Set(ids).size).toBe(ids.length);
  expect(doc.spaces.length).toBeGreaterThanOrEqual(1);
  expect(doc.spaces.map((s) => s.order)).toEqual(doc.spaces.map((_, i) => i));
  expect(doc.spaces.some((s) => s.id === doc.activeSpaceId)).toBe(true);
  for (const space of doc.spaces) {
    expect(space.layers.length).toBeGreaterThanOrEqual(1);
    expect(space.artboards.length).toBeGreaterThanOrEqual(1);
  }
}

function newSession(seed: number) {
  const ids = sequentialIds(`s${seed}`);
  let tick = 0;
  const now = () => `2026-01-01T00:00:${String(Math.floor(tick / 1000)).padStart(2, '0')}.${String(tick++ % 1000).padStart(3, '0')}Z`;
  const initial = sampleDocument(ids);
  const session = new DocumentSession(initial, { ids, now, historyLimit: 10_000 });
  return { ids, initial, session };
}

describe('1000 random operations', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`undo returns to the initial state and redo to the final one (seed ${seed})`, () => {
      const { ids, initial, session } = newSession(seed);
      const rng = createRng(seed);

      let applied = 0;
      let attempts = 0;
      while (applied < 1000 && attempts < 5000) {
        attempts++;
        if (session.run(randomCommand(rng, session.document, ids))) applied++;
        if (applied % 50 === 0) assertInvariants(session.document);
      }
      expect(applied).toBe(1000);
      assertInvariants(session.document);
      const final = session.document;

      let undone = 0;
      while (session.undo()) undone++;
      expect(undone).toBeGreaterThan(0);
      expect(content(session.document)).toEqual(content(initial));
      assertInvariants(session.document);

      let redone = 0;
      while (session.redo()) redone++;
      expect(redone).toBe(undone);
      expect(content(session.document)).toEqual(content(final));
    });
  }

  it('every intermediate undo/redo step matches the state recorded at that depth', () => {
    const { ids, initial, session } = newSession(42);
    const rng = createRng(42);
    const stateAtDepth: Document[] = [initial];

    for (let applied = 0; applied < 1000; ) {
      if (session.run(randomCommand(rng, session.document, ids))) {
        applied++;
        // With merging, several commands can land in one step: keep the latest state of that step.
        stateAtDepth[session.historyLength] = session.document;
      }
    }

    // Random walk over the history, checking each position.
    let depth = session.historyLength;
    for (let step = 0; step < 600; step++) {
      const goBack = depth > 0 && (depth === session.historyLength || rng.chance(0.5)) ? rng.chance(0.7) : false;
      if (goBack && session.undo()) depth--;
      else if (session.redo()) depth++;
      else if (session.undo()) depth--;
      expect(content(session.document)).toEqual(content(stateAtDepth[depth] as Document));
    }
  }, 30_000); // heavy by design: replays 1000 operations step by step

  it('rejects nothing silently: failed or no-op commands never create history steps', () => {
    const { ids, session } = newSession(7);
    const rng = createRng(7);
    let steps = 0;
    for (let i = 0; i < 300; i++) {
      const before = session.document;
      const ran = session.run(randomCommand(rng, before, ids, false));
      if (ran) steps++;
      else expect(session.document).toBe(before);
    }
    expect(session.historyLength).toBe(steps);
  });
});

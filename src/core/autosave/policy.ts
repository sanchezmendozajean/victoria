export const AUTOSAVE_INTERVAL_MS = 60_000;

/**
 * When to autosave one document (specs/02 · Autoguardado): every 60 s, only if the content changed.
 * Pure and clock-free: the caller passes `now`, so it is trivial to test.
 */
export class AutosavePolicy {
  private lastRevision: number;
  private lastAt: number;

  constructor(
    startRevision: number,
    startAt: number,
    private readonly intervalMs: number = AUTOSAVE_INTERVAL_MS,
  ) {
    this.lastRevision = startRevision;
    this.lastAt = startAt;
  }

  shouldSave(revision: number, now: number): boolean {
    return revision !== this.lastRevision && now - this.lastAt >= this.intervalMs;
  }

  markSaved(revision: number, now: number): void {
    this.lastRevision = revision;
    this.lastAt = now;
  }

  /** True while an autosave file exists for content newer than the last explicit save. */
  get lastSavedRevision(): number {
    return this.lastRevision;
  }
}

import { create } from 'zustand';

/** What the user can set in Edición › Preferencias (Ctrl+K). Kept per user, outside any document. */
export interface Preferences {
  /** Pen: over a selected path, a segment adds an anchor and an anchor deletes itself. */
  autoAddDelete: boolean;
  /** Pencil: 1 (few anchors, rough) to 5 (follows the stroke closely). */
  pencilFidelity: 1 | 2 | 3 | 4 | 5;
  /** Minutes between autosaves of a document that changed. */
  autosaveMinutes: number;
}

export const DEFAULT_PREFERENCES: Preferences = { autoAddDelete: true, pencilFidelity: 3, autosaveMinutes: 1 };

export const AUTOSAVE_MINUTES = { min: 1, max: 30 } as const;
const STORAGE_KEY = 'victoria.preferences';

/** Screen pixels a pencil stroke may stray from the fitted curve, by fidelity (3 is the original 2.5 px). */
const PENCIL_TOLERANCE_PX = [5, 3.5, 2.5, 1.75, 1] as const;
export const pencilTolerancePx = (fidelity: Preferences['pencilFidelity']): number => PENCIL_TOLERANCE_PX[fidelity - 1] ?? 2.5;

/** Anything read from storage is untrusted: unknown or out-of-range values fall back to the defaults. */
export function sanitizePreferences(raw: unknown): Preferences {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const fidelity = Number(source.pencilFidelity);
  const minutes = Number(source.autosaveMinutes);
  return {
    autoAddDelete: typeof source.autoAddDelete === 'boolean' ? source.autoAddDelete : DEFAULT_PREFERENCES.autoAddDelete,
    pencilFidelity: Number.isInteger(fidelity) && fidelity >= 1 && fidelity <= 5 ? (fidelity as Preferences['pencilFidelity']) : DEFAULT_PREFERENCES.pencilFidelity,
    autosaveMinutes: Number.isFinite(minutes) && minutes >= AUTOSAVE_MINUTES.min && minutes <= AUTOSAVE_MINUTES.max ? Math.round(minutes) : DEFAULT_PREFERENCES.autosaveMinutes,
  };
}

function load(): Preferences {
  try {
    return sanitizePreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

interface PreferencesState {
  prefs: Preferences;
  set(patch: Partial<Preferences>): void;
  reset(): void;
}

export const usePreferences = create<PreferencesState>((set, get) => {
  const save = (prefs: Preferences) => {
    set({ prefs });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Storage can be blocked; the preferences then last for the session.
    }
  };
  return {
    prefs: load(),
    set: (patch) => save(sanitizePreferences({ ...get().prefs, ...patch })),
    reset: () => save(DEFAULT_PREFERENCES),
  };
});

/** For code outside React (tools, the document manager). */
export const getPreferences = (): Preferences => usePreferences.getState().prefs;

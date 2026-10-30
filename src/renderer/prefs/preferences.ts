import { create } from 'zustand';
import { DEFAULT_SHORTCUTS, isShortcutAction, isValidAccelerator, normalizeAccelerator, setShortcutOverrides } from '../app/shortcuts';

/** What the user can set in Edición › Preferencias (Ctrl+K). Kept per user, outside any document. */
export interface Preferences {
  /** Pen: over a selected path, a segment adds an anchor and an anchor deletes itself. */
  autoAddDelete: boolean;
  /** Pencil: 1 (few anchors, rough) to 5 (follows the stroke closely). */
  pencilFidelity: 1 | 2 | 3 | 4 | 5;
  /** Minutes between autosaves of a document that changed. */
  autosaveMinutes: number;
  /** Open with the start screen instead of an empty document. */
  startScreen: boolean;
  /** Archivo › Colocar links the picture to its file instead of embedding it. */
  placeLinked: boolean;
  /** Shortcuts the user changed (action → accelerator); everything else keeps its default. */
  shortcuts: Record<string, string>;
}

export const DEFAULT_PREFERENCES: Preferences = { autoAddDelete: true, pencilFidelity: 3, autosaveMinutes: 1, startScreen: false, placeLinked: false, shortcuts: {} };

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
    startScreen: typeof source.startScreen === 'boolean' ? source.startScreen : DEFAULT_PREFERENCES.startScreen,
    placeLinked: typeof source.placeLinked === 'boolean' ? source.placeLinked : DEFAULT_PREFERENCES.placeLinked,
    shortcuts: sanitizeShortcuts(source.shortcuts),
  };
}

/**
 * Stored shortcut changes, cleaned: known actions, valid accelerators, and no two actions on one accelerator
 * (the changes involved in a clash are dropped, so they cannot leave a key doing two things).
 */
export function sanitizeShortcuts(raw: unknown): Record<string, string> {
  const wanted: Record<string, string> = {};
  if (typeof raw === 'object' && raw !== null) {
    for (const [action, accelerator] of Object.entries(raw as Record<string, unknown>)) {
      if (isShortcutAction(action) && typeof accelerator === 'string' && isValidAccelerator(accelerator)) wanted[action] = accelerator;
    }
  }
  for (;;) {
    const effective = { ...DEFAULT_SHORTCUTS, ...wanted } as Record<string, string>;
    const owners = new Map<string, string[]>();
    for (const [action, accelerator] of Object.entries(effective)) {
      const key = normalizeAccelerator(accelerator);
      owners.set(key, [...(owners.get(key) ?? []), action]);
    }
    const clashing = [...owners.values()].filter((actions) => actions.length > 1).flat();
    const drop = clashing.filter((action) => action in wanted);
    if (drop.length === 0) return wanted;
    for (const action of drop) delete wanted[action];
  }
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

// The shortcuts in force follow the preferences: now, and whenever they change.
setShortcutOverrides(getPreferences().shortcuts);
usePreferences.subscribe((state, previous) => {
  if (state.prefs.shortcuts !== previous.prefs.shortcuts) setShortcutOverrides(state.prefs.shortcuts);
});

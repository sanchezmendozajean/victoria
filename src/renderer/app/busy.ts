import { create } from 'zustand';

/** A long task running off the main thread (the status bar shows it, with a way to stop it). */
interface BusyState {
  task: { label: string; cancel(): void } | null;
  start(label: string, cancel: () => void): void;
  end(): void;
}

export const useBusy = create<BusyState>((set) => ({
  task: null,
  start: (label, cancel) => set({ task: { label, cancel } }),
  end: () => set({ task: null }),
}));

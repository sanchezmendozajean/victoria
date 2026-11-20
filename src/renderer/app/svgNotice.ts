import { create } from 'zustand';
import { svgBlockReason, type SvgGate } from '../../core';
import { t, type TranslationKey } from '../i18n';

// Kept apart from svgMode.ts: the document manager reports refusals through here and must not import the UI that imports it.

/** Why a gate is blocked, in the person's language (and how to carry on). */
export const svgReason = (gate: SvgGate): string => t(`svg.blocked.${svgBlockReason(gate)}` as TranslationKey);

interface NoticeState {
  message: string | null;
  show(message: string): void;
  clear(): void;
}

/** The last refusal, shown in the status bar for a few seconds. */
export const useSvgNotice = create<NoticeState>((set) => ({
  message: null,
  show: (message) => set({ message }),
  clear: () => set({ message: null }),
}));

let timer: ReturnType<typeof setTimeout> | undefined;

/** A command was refused because an SVG cannot hold what it adds. */
export function showSvgBlocked(gate: SvgGate): void {
  useSvgNotice.getState().show(svgReason(gate));
  clearTimeout(timer);
  timer = setTimeout(() => useSvgNotice.getState().clear(), 6000);
}

import { useEffect } from 'react';
import type { SvgGate } from '../../core';
import { manager, useDocuments } from '../documents';
import { useUi } from './store';
import { svgReason } from './svgNotice';
import type { ToolId } from './tools';

export { showSvgBlocked, svgReason, useSvgNotice } from './svgNotice';

// The SVG mode in the interface (specs/02 · Modo SVG). The rule itself lives in the core (`svgGuard`, run on every
// command); this file only says why a control is unavailable and tells the person when a command was refused.

/** The gate behind each tool that an SVG cannot keep. */
export const TOOL_GATES: Partial<Record<ToolId, SvgGate>> = {
  'tool-area-type': 'text.area',
  'tool-type-on-path': 'text.onPath',
  'tool-artboard': 'artboard.multiple',
};

export const isSvgMode = (): boolean => manager.active?.format === 'svg';

/** Whether the document in front is an SVG being edited in place. */
export const useSvgMode = (): boolean => useDocuments().active?.format === 'svg';

/** Why the tool cannot be used in the open document; null when it can. */
export function toolBlockReason(tool: ToolId): string | null {
  const gate = TOOL_GATES[tool];
  return gate && isSvgMode() ? svgReason(gate) : null;
}

/** Why a gate is blocked in the open document; null when the document is not an SVG (or the gate is free). */
export const gateReason = (gate: SvgGate): string | null => (isSvgMode() ? svgReason(gate) : null);

/** Hooks the SVG mode into the tool switcher; call once from the app shell. */
export function useSvgModeWiring(): void {
  useEffect(() => {
    useUi.setState({ toolBlock: toolBlockReason });
    return () => useUi.setState({ toolBlock: null });
  }, []);
  // Leaving the SVG document (or its being turned into a .vict) must not leave a blocked tool selected.
  const active = useDocuments().active;
  const tool = useUi((s) => s.activeTool);
  useEffect(() => {
    if (toolBlockReason(tool)) useUi.getState().setActiveTool('tool-select');
  }, [active, tool]);
}

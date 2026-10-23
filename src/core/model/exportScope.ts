import type { Artboard, Document, Space } from './types';

/** What an export or print run covers (specs/04 · regla 7). */
export type ExportScope = 'active-artboard' | 'space-artboards' | 'all-spaces';

export interface ExportTarget {
  space: Space;
  artboard: Artboard;
}

/**
 * The artboards a run covers, in Space order and then artboard order (the order of the panels).
 * "Excluir de exportación" only filters the run over all Spaces: asking for the active Space or artboard is explicit.
 */
export function exportTargets(doc: Document, scope: ExportScope, activeArtboardId?: string | null): ExportTarget[] {
  const active = doc.spaces.find((s) => s.id === doc.activeSpaceId) ?? doc.spaces[0];
  if (!active) return [];
  if (scope === 'active-artboard') {
    const artboard = active.artboards.find((a) => a.id === activeArtboardId) ?? active.artboards[0];
    return artboard ? [{ space: active, artboard }] : [];
  }
  const spaces = scope === 'space-artboards' ? [active] : doc.spaces.filter((s) => !s.excludeFromExport);
  return spaces.flatMap((space) => space.artboards.map((artboard) => ({ space, artboard })));
}

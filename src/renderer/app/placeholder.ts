// PLACEHOLDER document state for the Phase 1 shell, copied from mockup screen 3.
// The real document lives in `src/core` (Phase 2); this file is deleted when the tabs bind to it.

export interface PlaceholderSpace {
  id: string;
  name: string;
  color: string;
  artboards: number;
  excludedFromExport?: boolean;
}

export interface PlaceholderDocument {
  id: string;
  name: string;
  dirty: boolean;
  spaces: PlaceholderSpace[];
}

export const PLACEHOLDER_DOCUMENTS: PlaceholderDocument[] = [
  {
    id: 'doc-logo',
    name: 'logo.vict',
    dirty: true,
    spaces: [
      { id: 'sp-icons', name: 'Íconos', color: 'var(--space-1)', artboards: 4 },
      { id: 'sp-a4', name: 'Hoja A4', color: 'var(--space-2)', artboards: 1 },
      { id: 'sp-sketches', name: 'Bocetos', color: 'var(--space-3)', artboards: 2, excludedFromExport: true },
    ],
  },
  {
    id: 'doc-cards',
    name: 'tarjetas.vict',
    dirty: false,
    spaces: [
      { id: 'sp-design', name: 'Diseño', color: 'var(--space-5)', artboards: 4 },
      { id: 'sp-variants', name: 'Variantes', color: 'var(--space-6)', artboards: 2 },
    ],
  },
];

import { FillPanel } from './FillPanel';
import type { PanelId } from './registry';

/** The content of each panel. Panels still to come (Fases 7–11) render empty. */
export function PanelBody({ id }: { id: PanelId }) {
  switch (id) {
    case 'fill':
      return <FillPanel />;
    default:
      return null;
  }
}

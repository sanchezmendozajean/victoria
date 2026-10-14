import { FillPanel } from './FillPanel';
import { GradientPanel } from './GradientPanel';
import { SwatchesPanel } from './SwatchesPanel';
import type { PanelId } from './registry';

/** The content of each panel. Panels still to come (Fases 7–11) render empty. */
export function PanelBody({ id }: { id: PanelId }) {
  switch (id) {
    case 'fill':
      return <FillPanel />;
    case 'swatches':
      return <SwatchesPanel />;
    case 'gradient':
      return <GradientPanel />;
    default:
      return null;
  }
}

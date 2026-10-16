import { CharacterPanel } from './CharacterPanel';
import { ParagraphPanel } from './ParagraphPanel';
import { AlignPanel } from './AlignPanel';
import { FillPanel } from './FillPanel';
import { TransformPanel } from './TransformPanel';
import { LayersPanel } from './LayersPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { SpacingPanel } from './SpacingPanel';
import { GradientPanel } from './GradientPanel';
import { StrokePanel } from './StrokePanel';
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
    case 'stroke':
      return <StrokePanel />;
    case 'character':
      return <CharacterPanel />;
    case 'paragraph':
      return <ParagraphPanel />;
    case 'align':
      return <AlignPanel />;
    case 'spacing':
      return <SpacingPanel />;
    case 'transform':
      return <TransformPanel />;
    case 'layers':
      return <LayersPanel />;
    case 'properties':
      return <PropertiesPanel />;
    default:
      return null;
  }
}

import { Rulers } from './Rulers';
import './CanvasArea.css';

/**
 * The infinite canvas area. Phase 1 renders the empty grey surface and the rulers; the Viewport,
 * Renderer and Overlay arrive in Phase 3. The ruler values are those of mockup screen 3 (1200 %).
 */
export function CanvasArea() {
  return (
    <main className="vc-canvas" data-testid="canvas">
      <Rulers originX={221} originY={60} pixelsPerUnit={12} every={4} />
      <div className="vc-canvas__surface" data-testid="canvas-surface" />
    </main>
  );
}

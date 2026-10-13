/** Imperative view commands (zoom, fit) so menus, shortcuts and the status bar can drive the canvas. */
export interface CanvasApi {
  zoomIn(): void;
  zoomOut(): void;
  /** `zoom` 1 = 100 %. Keeps the centre of the window. */
  zoomTo(zoom: number): void;
  fitArtboard(): void;
  fitAll(): void;
  actualSize(): void;
  /** Fits one artboard (status bar navigator). */
  fitArtboardById(id: string): void;
}

/** Set by the mounted canvas; null while no canvas exists. */
export const canvasApi: { current: CanvasApi | null } = { current: null };

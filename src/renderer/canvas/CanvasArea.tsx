import { useEffect, useRef } from 'react';
import { frameOf, getActiveSpace } from '../../core';
import { askUser } from '../app/dialogs';
import { fontManager } from '../text/fontManager';
import { manager } from '../documents';
import { RULER_SIZE } from './rulerRenderer';
import { t } from '../i18n';
import { useDocuments } from '../documents';
import { useUi } from '../app/store';
import { canvasApi } from './api';
import { CanvasController } from './controller';
import './CanvasArea.css';

/**
 * The infinite canvas of the active Space: artboards, grid, artwork, guides and rulers drawn on Canvas 2D
 * (specs/01 · Render). React only mounts the canvases; `CanvasController` does the work.
 */
export function CanvasArea() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rulerHRef = useRef<HTMLCanvasElement>(null);
  const rulerVRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<CanvasController | null>(null);

  const documents = useDocuments();
  const session = documents.active?.session ?? null;
  const toolId = useUi((s) => s.activeTool);
  const theme = useUi((s) => s.theme);
  const viewOptions = useUi((s) => s.viewOptions);
  const activeArtboard = useUi((s) => s.activeArtboard);
  const setZoom = useUi((s) => s.setZoom);
  const setCursor = useUi((s) => s.setCursor);

  const space = session?.document.spaces.find((s) => s.id === session.document.activeSpaceId);
  const activeArtboardId = space ? (activeArtboard[space.id] ?? space.artboards[0]?.id ?? null) : null;
  const units = session?.document.meta.units ?? 'mm';
  const isolationId = useUi((s) => (space ? (s.isolation[space.id] ?? null) : null));
  // An isolated group that no longer exists (undo, delete) simply ends the mode.
  const isolation = space && isolationId && frameOf(space, isolationId) ? isolationId : null;

  useEffect(() => {
    const surface = surfaceRef.current;
    const content = contentRef.current;
    const overlay = overlayRef.current;
    const rulerH = rulerHRef.current;
    const rulerV = rulerVRef.current;
    if (!surface || !content || !overlay || !rulerH || !rulerV) return;

    // Cursor and zoom updates are coalesced to one per frame so React is not flooded by pointer moves.
    let frame = 0;
    let pendingCursor: { x: number; y: number } | null | undefined;
    let pendingZoom: number | undefined;
    const flush = () => {
      frame = 0;
      if (pendingCursor !== undefined) setCursor(pendingCursor);
      if (pendingZoom !== undefined) setZoom(pendingZoom);
      pendingCursor = undefined;
      pendingZoom = undefined;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const controller = new CanvasController(
      { surface, content, overlay, rulerH, rulerV },
      {
        onView: (view) => {
          pendingZoom = view.zoom;
          schedule();
        },
        onCursor: (doc) => {
          pendingCursor = doc;
          schedule();
        },
        confirm: (spec) => askUser(spec),
        onIsolation: (id) => {
          const active = manager.active?.session;
          if (active) useUi.getState().setIsolation(getActiveSpace(active.document).id, id);
        },
        onTransformDialog: (kind, origin) => useUi.getState().openTransformDialog(kind, origin),
        activePaint: () => useUi.getState().activePaint,
        activeLayer: (spaceId) => useUi.getState().activeLayer[spaceId] ?? null,
        textStyle: () => useUi.getState().textStyle,
        paragraphStyle: () => useUi.getState().paragraphStyle,
        pendingTextStyle: () => useUi.getState().pendingTextStyle,
        consumePendingTextStyle: () => useUi.getState().setPendingTextStyle(null),
        onTextEditing: (editing) => useUi.getState().setTextEditing(editing),
        onSwitchTool: (tool) => useUi.getState().setActiveTool(tool),
        onTextEditRequest: (request) => useUi.getState().setTextEditRequest(request),
        takeTextEditRequest: () => {
          const request = useUi.getState().textEditRequest;
          if (request) useUi.getState().setTextEditRequest(null);
          return request;
        },
        onTextInput: ({ active, at }) => {
          const input = inputRef.current;
          if (!input) return;
          if (active) {
            if (at) {
              input.style.left = `${at.x}px`;
              input.style.top = `${at.y}px`;
            }
            if (document.activeElement !== input) input.focus({ preventScroll: true });
          } else if (document.activeElement === input) {
            input.blur();
          }
        },
        scaleStrokes: () => useUi.getState().scaleStrokes,
        keyObject: () => ({ mode: useUi.getState().alignTo === 'key', id: useUi.getState().keyObject }),
        onKeyObject: (id) => useUi.getState().setKeyObject(id),
        setNewAppearance: (appearance) => useUi.getState().setNewLook(appearance),
        newAppearance: () => JSON.parse(JSON.stringify(useUi.getState().newLook)),
        onShapeDialog: (kind, at) => useUi.getState().openShapeDialog(kind, at),
        onRememberTransform: (transform) => useUi.getState().setLastTransform(transform),
      },
    );
    controllerRef.current = controller;
    canvasApi.current = controller;
    // Text is laid out with the fonts loaded so far: repaint when more arrive.
    const unsubscribeFonts = fontManager.subscribe(() => controller.redraw());
    return () => {
      cancelAnimationFrame(frame);
      canvasApi.current = null;
      controllerRef.current = null;
      unsubscribeFonts();
      controller.destroy();
    };
  }, [setCursor, setZoom]);

  useEffect(() => {
    controllerRef.current?.update({
      session,
      toolId,
      options: {
        outline: viewOptions.outline,
        guides: viewOptions.guides,
        lockGuides: viewOptions.lockGuides,
        grid: viewOptions.grid,
        hideArtboards: viewOptions.hideArtboards,
        snapGrid: viewOptions.snapGrid,
        smartGuides: viewOptions.smartGuides,
        hideEdges: viewOptions.hideEdges,
        showHandles: viewOptions.showHandles,
      },
      activeArtboardId,
      units,
      themeName: theme,
      isolation,
    });
  });

  const rulers = viewOptions.rulers;
  const beginGuide = (orientation: 'horizontal' | 'vertical', event: React.PointerEvent) => {
    event.preventDefault();
    controllerRef.current?.beginGuideFromRuler(orientation, event.nativeEvent);
  };

  return (
    <main className="vc-canvas" data-testid="canvas" style={{ ['--ruler' as string]: rulers ? `${RULER_SIZE}px` : '0px' }}>
      <div
        ref={surfaceRef}
        className="vc-canvas__surface"
        data-testid="canvas-surface"
        style={space?.canvasColor ? { background: space.canvasColor } : undefined}
      >
        <canvas ref={contentRef} className="vc-canvas__layer" data-testid="canvas-content" aria-label={t('canvas.label')} />
        <canvas ref={overlayRef} className="vc-canvas__layer vc-canvas__overlay" data-testid="canvas-overlay" />
        <textarea
          ref={inputRef}
          className="vc-textinput"
          data-testid="text-input"
          aria-label={t('text.input')}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          rows={1}
          onInput={(event) => {
            const el = event.currentTarget;
            const native = event.nativeEvent as InputEvent;
            if (native.isComposing) return; // the composed text arrives with compositionend
            const text = el.value;
            el.value = '';
            if (text) controllerRef.current?.textInput(text);
          }}
          onCompositionEnd={(event) => {
            event.currentTarget.value = '';
            if (event.data) controllerRef.current?.textInput(event.data);
          }}
          onKeyDown={(event) => {
            if (controllerRef.current?.textKeyDown(event.nativeEvent)) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onCopy={(event) => {
            const text = controllerRef.current?.textClipboard('copy', null);
            if (text !== null && text !== undefined) {
              event.clipboardData.setData('text/plain', text);
              event.preventDefault();
            }
          }}
          onCut={(event) => {
            const text = controllerRef.current?.textClipboard('cut', null);
            if (text !== null && text !== undefined) {
              event.clipboardData.setData('text/plain', text);
              event.preventDefault();
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            controllerRef.current?.textClipboard('paste', event.clipboardData.getData('text/plain'));
          }}
        />
      </div>
      <canvas
        ref={rulerHRef}
        className="vc-canvas__ruler vc-canvas__ruler--h"
        data-testid="ruler-h"
        hidden={!rulers}
        title={t('canvas.guideHint')}
        onPointerDown={(event) => beginGuide('horizontal', event)}
      />
      <canvas
        ref={rulerVRef}
        className="vc-canvas__ruler vc-canvas__ruler--v"
        data-testid="ruler-v"
        hidden={!rulers}
        title={t('canvas.guideHint')}
        onPointerDown={(event) => beginGuide('vertical', event)}
      />
      <div className="vc-canvas__corner" hidden={!rulers} title={t('canvas.rulerOrigin')} />
    </main>
  );
}
